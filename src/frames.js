import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const execFileAsync = promisify(execFile);
const ffprobePath = ffprobeStatic.path;

/** Long-edge pixel cap for extracted frames. Claude Opus 5 accepts up to 2576px,
 *  but 1400 keeps gait detail (limb position, head carriage, foot landing) while
 *  holding image-token cost to roughly a third. */
const MAX_EDGE = 1400;

export class VideoError extends Error {}

/** Read duration, dimensions and frame rate without decoding the whole file. */
export async function probe(videoPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,avg_frame_rate:format=duration',
      '-of', 'json',
      videoPath,
    ]));
  } catch (err) {
    throw new VideoError(
      'Could not read that file as a video. Supported formats include MP4, MOV, AVI, WebM and MKV.',
      { cause: err },
    );
  }

  const info = JSON.parse(stdout);
  const stream = info.streams?.[0];
  const duration = Number.parseFloat(info.format?.duration);

  if (!stream) throw new VideoError('That file has no video track.');
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new VideoError('Could not determine the length of that video.');
  }
  if (duration < 1.5) {
    throw new VideoError(
      `That clip is only ${duration.toFixed(1)}s long. Please upload at least 4-5 seconds so a full stride cycle is visible.`,
    );
  }

  // avg_frame_rate arrives as a rational string like "30000/1001".
  const [num, den] = String(stream.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den ? num / den : 0;

  return {
    duration,
    width: stream.width,
    height: stream.height,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
  };
}

/** A trot stride cycle is roughly 0.6-0.85s. Each burst is timed to span a little
 *  over one full cycle so the head can be tracked from one extreme to the other. */
const BURST_SPAN_SECONDS = 0.8;

/**
 * Sample frames in dense bursts rather than as a thin even spread.
 *
 * This matters more than it looks. Spreading N frames evenly across a 10s clip
 * puts them ~0.7-0.8s apart, which is the same order as a trot stride cycle — so
 * consecutive frames land at effectively arbitrary stride phases and the head-nod
 * and hip-hike rules cannot be applied at all. (A live run confirmed this: the
 * model correctly refused to call laterality and named the aliasing as the reason.)
 *
 * Instead we take a few short bursts of closely-spaced frames. Within a burst,
 * frames are consecutive enough to track the head through a stride; across
 * bursts, we still sample different moments of the clip.
 *
 * Frames are taken from the middle 90% of the video: the first and last moments
 * of a hand-held clip are usually the handler still setting up or the horse
 * already halted.
 */
export async function extractFrames(videoPath, count = 18, burstCount = 3) {
  const meta = await probe(videoPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stride-frames-'));

  const usableStart = meta.duration * 0.05;
  const usableSpan = meta.duration * 0.9;

  // Fall back to fewer bursts on short clips so bursts cannot overlap.
  const bursts = Math.max(1, Math.min(burstCount, Math.floor(usableSpan / (BURST_SPAN_SECONDS * 1.5)) || 1));
  const perBurst = Math.max(2, Math.floor(count / bursts));
  const innerStep = BURST_SPAN_SECONDS / (perBurst - 1);

  // Space burst start points evenly through the usable span.
  const burstStride = bursts > 1 ? (usableSpan - BURST_SPAN_SECONDS) / (bursts - 1) : 0;

  const plan = [];
  for (let b = 0; b < bursts; b++) {
    const burstStart = usableStart + burstStride * b;
    for (let i = 0; i < perBurst; i++) {
      plan.push({ burst: b, indexInBurst: i, timestamp: burstStart + innerStep * i });
    }
  }

  try {
    const frames = [];
    for (const [i, shot] of plan.entries()) {
      const timestamp = shot.timestamp;
      const outPath = path.join(dir, `${String(i).padStart(2, '0')}-${randomUUID()}.jpg`);

      await execFileAsync(ffmpegPath, [
        '-v', 'error',
        // -ss before -i uses fast input seeking; accurate enough at this scale.
        '-ss', timestamp.toFixed(3),
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', `scale='if(gt(iw,ih),min(${MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${MAX_EDGE},ih))'`,
        '-q:v', '3',
        '-y',
        outPath,
      ]);

      const buffer = await fs.readFile(outPath).catch(() => null);
      if (!buffer?.length) continue; // seek landed past the last decodable frame

      frames.push({
        index: frames.length,
        burst: shot.burst,
        indexInBurst: shot.indexInBurst,
        timestamp,
        label: `burst ${shot.burst + 1}, frame ${shot.indexInBurst + 1} — t=${timestamp.toFixed(2)}s`,
        base64: buffer.toString('base64'),
      });
    }

    if (frames.length < 3) {
      throw new VideoError(
        'Could not extract enough usable frames from that video. It may be corrupted or use an unsupported codec.',
      );
    }

    return { meta, frames, sampling: { bursts, perBurst, innerStep } };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
