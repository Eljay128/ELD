import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { motionProfile, pickBurstStarts } from './motion.js';

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
    // Full stream JSON so rotation metadata is available: phone video is stored
    // landscape with a rotate flag, and reporting the stored dimensions gets
    // portrait clips backwards.
    ({ stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_streams',
      '-show_entries', 'format=duration',
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

  // Rotation lives either in side_data_list (modern ffprobe) or the legacy
  // tags.rotate. ffmpeg auto-rotates on decode, so the frames we extract are
  // already upright — only the reported dimensions need swapping to match.
  const sideRotation = stream.side_data_list?.find((d) => d.rotation != null)?.rotation;
  const tagRotation = stream.tags?.rotate;
  const rotation = Math.abs(Number(sideRotation ?? tagRotation ?? 0)) % 180;
  const rotated = rotation === 90;

  return {
    duration,
    width: rotated ? stream.height : stream.width,
    height: rotated ? stream.width : stream.height,
    rotated,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
  };
}

/**
 * How long each burst should span, by gait. A burst has to cover slightly more
 * than one full stride cycle for the head to be trackable from one extreme to
 * the other.
 *
 * A trot cycle is roughly 0.6-0.85s, but a WALK cycle is 1.1-1.3s — so the
 * original flat 0.8s span could never contain a full walk stride. A live run on
 * a walk-only clip caught exactly that ("none of which covers a complete walk
 * stride"), which is why this is keyed to gait rather than fixed.
 */
const BURST_SPAN_BY_GAIT = {
  walk: 1.45,
  trot: 0.85,
  canter: 0.95,
  default: 1.15, // unknown gait: long enough for a walk, still usable for a trot
};

function burstSpanFor(gaitHint) {
  const g = String(gaitHint ?? '').toLowerCase();
  if (g.includes('walk') && g.includes('trot')) return BURST_SPAN_BY_GAIT.default;
  if (g.includes('walk')) return BURST_SPAN_BY_GAIT.walk;
  if (g.includes('trot')) return BURST_SPAN_BY_GAIT.trot;
  if (g.includes('canter')) return BURST_SPAN_BY_GAIT.canter;
  return BURST_SPAN_BY_GAIT.default;
}

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
export async function extractFrames(videoPath, count = 18, burstCount = 3, { gait } = {}) {
  const meta = await probe(videoPath);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stride-frames-'));

  const span = burstSpanFor(gait);
  const usableStart = meta.duration * 0.05;
  const usableEnd = meta.duration * 0.95;
  const usableSpan = usableEnd - usableStart;

  // Fall back to fewer bursts on short clips so bursts cannot overlap.
  const bursts = Math.max(1, Math.min(burstCount, Math.floor(usableSpan / (span * 1.5)) || 1));
  const perBurst = Math.max(2, Math.floor(count / bursts));
  const innerStep = span / (perBurst - 1);

  // Place bursts where the clip is actually moving, rather than at fixed
  // intervals that can land on a turn, a halt or the walk-down.
  const profile = await motionProfile(videoPath);
  const starts = pickBurstStarts(profile, { usableStart, usableEnd, span, count: bursts });

  const plan = [];
  starts.forEach((burstStart, b) => {
    for (let i = 0; i < perBurst; i++) {
      plan.push({ burst: b, indexInBurst: i, timestamp: burstStart + innerStep * i });
    }
  });

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

    return {
      meta,
      frames,
      sampling: { bursts, perBurst, innerStep, span, motionGuided: Boolean(profile) },
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
