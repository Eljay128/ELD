import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractFrames, VideoError } from './src/frames.js';
import { analyzeVideo } from './src/analyze.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(here, 'uploads');
const PORT = Number(process.env.PORT ?? 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 250);
const FRAME_COUNT = Math.min(Math.max(Number(process.env.FRAME_COUNT ?? 18), 6), 24);
const BURST_COUNT = Math.min(Math.max(Number(process.env.BURST_COUNT ?? 3), 1), 5);
const WEB_RESEARCH = process.env.WEB_RESEARCH !== 'false';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '\n  ANTHROPIC_API_KEY is not set.\n' +
      '  Copy .env.example to .env and add your key from https://console.anthropic.com/settings/keys\n',
  );
  process.exit(1);
}

await fs.mkdir(UPLOAD_DIR, { recursive: true });

const ACCEPTED = new Set(['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska']);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Phone uploads occasionally arrive as application/octet-stream, so fall back
    // to the extension. ffprobe is the real gatekeeper either way.
    const ok = ACCEPTED.has(file.mimetype) || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.originalname);
    cb(ok ? null : new Error('Please upload a video file (MP4, MOV, AVI, WebM or MKV).'), ok);
  },
});

/** In-memory job store. Single-process only — swap for Redis to run multiple workers. */
const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;

function createJob() {
  const id = randomUUID();
  jobs.set(id, { id, status: 'queued', events: [], listeners: new Set(), result: null, error: null, createdAt: Date.now() });
  return id;
}

function pushEvent(id, event) {
  const job = jobs.get(id);
  if (!job) return;
  job.events.push(event);
  for (const send of job.listeners) send(event);
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}, 5 * 60 * 1000).unref();

const app = express();
app.use(express.static(path.join(here, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({ maxUploadMb: MAX_UPLOAD_MB, frameCount: FRAME_COUNT, webResearch: WEB_RESEARCH });
});

app.post('/api/analyze', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video was uploaded.' });

  const intake = {};
  for (const [key, value] of Object.entries(req.body ?? {})) {
    if (typeof value === 'string') intake[key] = value.slice(0, 2000);
  }

  const jobId = createJob();
  res.json({ jobId });

  // Fire and forget: progress and the final report reach the client over SSE.
  runAnalysis(jobId, req.file.path, intake).catch((err) => {
    console.error(`[job ${jobId}]`, err);
  });
});

async function runAnalysis(jobId, videoPath, intake) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'running';

  try {
    pushEvent(jobId, { type: 'progress', message: 'Reading the video and sampling frames…' });
    const { meta, frames, sampling } = await extractFrames(videoPath, FRAME_COUNT, BURST_COUNT);

    pushEvent(jobId, {
      type: 'progress',
      message: `Sampled ${frames.length} frames in ${sampling.bursts} burst(s) from ${meta.duration.toFixed(1)}s of footage.`,
    });

    const result = await analyzeVideo({
      frames,
      meta,
      intake,
      sampling,
      webResearch: WEB_RESEARCH,
      onProgress: (message) => pushEvent(jobId, { type: 'progress', message }),
    });

    job.status = 'done';
    job.result = result;
    pushEvent(jobId, { type: 'done', result });
  } catch (err) {
    const message =
      err instanceof VideoError
        ? err.message
        : err?.status === 401
          ? 'The Anthropic API rejected the request — check that ANTHROPIC_API_KEY is valid.'
          : err?.status === 429
            ? 'Rate limited by the Anthropic API. Please wait a moment and try again.'
            : (err?.message ?? 'Analysis failed unexpectedly.');

    job.status = 'error';
    job.error = message;
    pushEvent(jobId, { type: 'error', message });
    if (!(err instanceof VideoError)) console.error(`[job ${jobId}]`, err);
  } finally {
    await fs.rm(videoPath, { force: true }).catch(() => {});
  }
}

app.get('/api/analyze/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Unknown or expired job.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let heartbeat;
  const close = () => {
    clearInterval(heartbeat);
    job.listeners.delete(send);
  };

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    // `done` and `error` are terminal — close rather than leaving the client
    // holding an open connection that will only ever receive heartbeats.
    if (event.type === 'done' || event.type === 'error') {
      close();
      res.end();
    }
  };

  // Replay anything that happened before this client connected.
  for (const event of job.events) send(event);

  if (job.status === 'done' || job.status === 'error') return;

  job.listeners.add(send);
  heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', close);
});

// Multer and filter errors surface here rather than as an unhandled rejection.
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `That video is larger than the ${MAX_UPLOAD_MB} MB limit. Trim the clip and try again.` });
  }
  res.status(400).json({ error: err?.message ?? 'Upload failed.' });
});

app.listen(PORT, () => {
  console.log(`\n  Stride running at http://localhost:${PORT}`);
  console.log(`  Frames per video: ${FRAME_COUNT} in ${BURST_COUNT} bursts   Web research: ${WEB_RESEARCH ? 'on' : 'off'}\n`);
});
