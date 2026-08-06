import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

/** Motion profile resolution. Tiny frames are enough — we want gross movement,
 *  not detail — and keep the whole profile well under a megabyte. */
const PROFILE_FPS = 10;
const PROFILE_W = 64;
const PROFILE_H = 36;

/**
 * Cheap motion profile of a clip: mean absolute frame-to-frame difference,
 * sampled at 10fps on 64x36 greyscale.
 *
 * This exists because bursts were previously placed at fixed intervals, which on
 * a real clip means some land on dead footage. A live run put one burst on a turn
 * and another on the walk-down, leaving only one of three on usable trot — the
 * model said so explicitly. Motion energy is a good enough proxy to steer around
 * that: a horse standing, turning or walking moves markedly less between frames
 * than one trotting past.
 *
 * It cannot separate camera pan from subject movement. That is acceptable here —
 * we only need a relative ranking of "where is something happening", not an
 * absolute measure.
 */
export async function motionProfile(videoPath) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(
      ffmpegPath,
      [
        '-v', 'error',
        '-i', videoPath,
        '-vf', `fps=${PROFILE_FPS},scale=${PROFILE_W}:${PROFILE_H},format=gray`,
        '-f', 'rawvideo',
        '-',
      ],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    ));
  } catch {
    return null; // Profiling is an optimisation; never let it break extraction.
  }

  const frameBytes = PROFILE_W * PROFILE_H;
  const frameCount = Math.floor(stdout.length / frameBytes);
  if (frameCount < 4) return null;

  const energy = [];
  for (let f = 1; f < frameCount; f++) {
    const a = f * frameBytes;
    const b = (f - 1) * frameBytes;
    let sum = 0;
    for (let i = 0; i < frameBytes; i++) sum += Math.abs(stdout[a + i] - stdout[b + i]);
    energy.push({ time: f / PROFILE_FPS, value: sum / frameBytes });
  }
  return energy;
}

/** Mean and standard deviation of profile samples inside [start, start+span). */
function windowStats(profile, start, span) {
  const inside = profile.filter((s) => s.time >= start && s.time < start + span);
  if (!inside.length) return null;
  const mean = inside.reduce((acc, s) => acc + s.value, 0) / inside.length;
  const variance = inside.reduce((acc, s) => acc + (s.value - mean) ** 2, 0) / inside.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Choose `count` burst start times inside [usableStart, usableEnd].
 *
 * Scores every candidate position by sustained motion (`mean - std`): the mean
 * favours the liveliest passage, and subtracting the deviation penalises windows
 * that straddle a transition — a burst half on a trot and half on a halt is worth
 * less than one wholly on either.
 *
 * Falls back to even spacing when profiling is unavailable, so behaviour degrades
 * to the previous scheme rather than failing.
 */
export function pickBurstStarts(profile, { usableStart, usableEnd, span, count }) {
  const latest = usableEnd - span;
  if (latest <= usableStart || count < 1) return [usableStart];

  const evenly = () =>
    count === 1
      ? [usableStart + (latest - usableStart) / 2]
      : Array.from({ length: count }, (_, i) => usableStart + ((latest - usableStart) / (count - 1)) * i);

  if (!profile?.length) return evenly();

  // Evaluate candidate starts on a fine grid.
  const step = 0.1;
  const candidates = [];
  for (let t = usableStart; t <= latest + 1e-9; t += step) {
    const stats = windowStats(profile, t, span);
    if (stats) candidates.push({ start: t, score: stats.mean - stats.std });
  }
  if (!candidates.length) return evenly();

  candidates.sort((a, b) => b.score - a.score);

  /* Bursts must stay *separated*, not merely non-overlapping. Three adjacent
     bursts are really one long burst: the value of multiple bursts is that a
     phase relationship confirmed at t=3s and again at t=9s is independent
     evidence, which is exactly the reasoning a live run used to call a limb
     ("two separate bursts seconds apart give the same phase relationship, so
     the pattern is repeatable").

     Try generous separation first and relax only if the clip is too short or
     too briefly active to support it. */
  const greedy = (minGap) => {
    const picked = [];
    for (const candidate of candidates) {
      if (picked.length >= count) break;
      if (picked.every((c) => Math.abs(c - candidate.start) >= minGap)) picked.push(candidate.start);
    }
    return picked;
  };

  let chosen = [];
  for (const gap of [span * 3, span * 2, span * 1.25, span]) {
    chosen = greedy(gap);
    if (chosen.length >= count) break;
  }

  // If overlap constraints starved us, top up with evenly spaced slots.
  for (const t of evenly()) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c - t) >= span * 0.5)) chosen.push(t);
  }

  return chosen.sort((a, b) => a - b);
}
