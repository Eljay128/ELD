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

/**
 * Sample `count` frames spread evenly across the clip.
 *
 * Frames are taken from the middle 90% of the video: the first and last moments
 * of a hand-held clip are usually the handler still setting up or the horse
 * already halted, which wastes tokens on frames with no gait in them.
 */
export async function extractFrames(videoPath, count = 14) {
  const meta = await probe(videoPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stride-frames-'));

  const start = meta.duration * 0.05;
  const span = meta.duration * 0.9;
  const step = count > 1 ? span / (count - 1) : 0;

  try {
    const frames = [];
    for (let i = 0; i < count; i++) {
      const timestamp = start + step * i;
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
        timestamp,
        label: `${timestamp.toFixed(2)}s`,
        base64: buffer.toString('base64'),
      });
    }

    if (frames.length < 3) {
      throw new VideoError(
        'Could not extract enough usable frames from that video. It may be corrupted or use an unsupported codec.',
      );
    }

    return { meta, frames };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
