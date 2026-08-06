/* Frame extraction through WebCodecs, for clips the <video> element refuses.
 *
 * The media element is all-or-nothing: one unsupported thing in the container
 * and the platform decoder never gets a chance. Here the container is parsed in
 * JS (see mp4.js) and encoded samples go straight to VideoDecoder, so a browser
 * that can decode HEVC will do so even when it will not open a .mov.
 *
 * This cannot conjure a decoder that is not there. When the platform genuinely
 * has no HEVC support, isConfigSupported says so and the caller falls back to
 * telling the owner why.
 */

import { demuxVideoTrack, keyframeBefore } from './mp4.js';

export async function openWithWebCodecs(file) {
  if (typeof VideoDecoder === 'undefined') return { ok: false, reason: 'this browser has no WebCodecs support' };

  const track = demuxVideoTrack(await file.arrayBuffer());
  if (!track) return { ok: false, reason: 'the file is not a readable MP4 or QuickTime container' };
  if (!track.count) return { ok: false, reason: 'the file contains no video samples' };

  const config = {
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    ...(track.description ? { description: track.description } : {}),
    hardwareAcceleration: 'no-preference',
    optimizeForLatency: true,
  };

  let supported = false;
  try {
    supported = (await VideoDecoder.isConfigSupported(config)).supported === true;
  } catch {
    supported = false;
  }
  if (!supported) {
    return {
      ok: false,
      reason: `this device has no decoder for ${track.entryType === 'hvc1' || track.entryType === 'hev1' ? 'HEVC' : track.entryType} video`,
      track,
    };
  }
  return { ok: true, track, config };
}

/**
 * Decode the frames nearest to `times`, in one forward pass.
 *
 * Decoders are sequential: reaching a frame means starting at the keyframe
 * before it and decoding everything in between. Sorting the targets and walking
 * the file once keeps that cost to a single pass instead of one per frame.
 */
export async function decodeFramesAt(file, { track, config }, times, onFrame, onProgress) {
  const wanted = times.map((time, order) => ({ time, order })).sort((a, b) => a.time - b.time);
  const results = new Array(wanted.length);
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let cursor = 0;   // which target we are waiting for
  let decoded = 0;
  let failure = null;

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        // Frames arrive in presentation order; take the first one at or past
        // each target, then move to the next.
        const t = frame.timestamp / 1e6;
        while (cursor < wanted.length && t + 1e-4 >= wanted[cursor].time) {
          results[wanted[cursor].order] = onFrame(frame, wanted[cursor].time);
          cursor++;
          decoded++;
          onProgress?.(decoded, wanted.length);
        }
      } finally {
        frame.close();
      }
    },
    error: (e) => { failure = e; },
  });

  decoder.configure(config);

  // Feed from the keyframe before the first target through to the last one.
  const firstSample = keyframeBefore(track, wanted[0].time);
  let lastSample = track.count - 1;
  for (let i = 0; i < track.count; i++) {
    if (track.times[i] > wanted[wanted.length - 1].time + 0.5) { lastSample = i; break; }
  }

  for (let i = firstSample; i <= lastSample; i++) {
    if (failure || cursor >= wanted.length) break;
    const start = track.offsets[i];
    const chunk = new EncodedVideoChunk({
      type: track.keyframes.includes(i) ? 'key' : 'delta',
      timestamp: Math.round(track.times[i] * 1e6),
      data: bytes.subarray(start, start + track.sizes[i]),
    });
    decoder.decode(chunk);
    // Let output callbacks run and keep the queue from ballooning on 1080p.
    if (decoder.decodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (!failure) {
    try { await decoder.flush(); } catch (e) { failure = e; }
  }
  try { decoder.close(); } catch { /* already closed */ }

  if (failure) throw new Error(`The decoder failed on this clip: ${failure.message ?? failure}`);
  return results;
}
