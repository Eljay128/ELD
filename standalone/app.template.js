/* Stride — standalone browser build.
   Everything the server normally does happens here instead: frame extraction via
   <video> + canvas, motion profiling via pixel diffs, and two calls straight to
   api.anthropic.com. No Node, no npm, no server. */

const CONFIG = window.__STRIDE__;
const MODEL = 'claude-opus-5';
const API = 'https://api.anthropic.com/v1/messages';

const MAX_EDGE = 1400;
const FRAME_BUDGET = 36;
const BURSTS = 3;
const BURST_SPAN_BY_GAIT = { walk: 1.45, trot: 0.85, canter: 0.95, default: 1.15 };

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const list = (items, cls) => {
  const ul = el('ul', cls);
  for (const i of items ?? []) ul.append(el('li', null, i));
  return ul;
};

const views = { key: $('#view-key'), upload: $('#view-upload'), working: $('#view-working'), report: $('#view-report'), error: $('#view-error') };
function show(name) {
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function fail(msg, detail) {
  $('#error-message').textContent = msg;
  const box = $('#error-detail');
  box.textContent = detail ?? '';
  box.parentElement.hidden = !detail;
  show('error');
}

/** What the browser itself reports about a clip it would not open. Guessing at
 *  this from the outside wastes runs; these five lines say which layer failed. */
function decodeReport(video, file) {
  const probe = document.createElement('video');
  const can = (type) => probe.canPlayType(type) || 'no';
  const NETWORK = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];
  const READY = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
  return [
    `file        ${file.name} · ${(file.size / 1048576).toFixed(1)} MB · type "${file.type || 'unreported'}"`,
    `readyState  ${video.readyState} (${READY[video.readyState] ?? '?'})`,
    `network     ${video.networkState} (${NETWORK[video.networkState] ?? '?'})`,
    `mediaError  ${video.error ? `code ${video.error.code} — ${video.error.message || 'no message'}` : 'none'}`,
    `size        ${video.videoWidth}x${video.videoHeight}`,
    `can play    h264=${can('video/mp4; codecs="avc1.42E01E"')} · hevc=${can('video/mp4; codecs="hvc1"')} · quicktime=${can('video/quicktime')}`,
    `browser     ${navigator.userAgent}`,
  ].join('\n');
}
function log(msg) {
  $('#log').append(el('li', null, msg));
  $('#log').lastChild.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------------ api key */
// sessionStorage, not localStorage: the key is gone when the tab closes.
let apiKey = sessionStorage.getItem('stride-key') || '';

$('#key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#key-input').value.trim();
  if (!v.startsWith('sk-ant-')) {
    $('#key-error').textContent = 'That does not look like an Anthropic key — they begin with sk-ant-.';
    return;
  }
  apiKey = v;
  if ($('#key-remember').checked) sessionStorage.setItem('stride-key', v);
  show('upload');
});

$('#forget-key').addEventListener('click', () => {
  sessionStorage.removeItem('stride-key');
  apiKey = '';
  $('#key-input').value = '';
  show('key');
});

/* -------------------------------------------------------------- view slots */
const slots = [...document.querySelectorAll('.slot')];
const chosen = () => slots.filter((s) => s.file);

function refreshSubmit() {
  const picked = chosen();
  const n = picked.length;
  const checking = picked.filter((s) => s.readable === undefined).length;
  const broken = picked.filter((s) => s.readable === false);
  const missing = slots.filter((s) => !s.file).map((s) => s.dataset.view);

  $('#submit').disabled = n === 0 || checking > 0 || broken.length > 0;

  $('#submit-note').textContent =
    n === 0
      ? 'Add at least one video to begin.'
      : broken.length
        ? `Remove the ${broken.map((s) => s.dataset.view).join(' and ')} clip, or open it in a browser that can read it.`
        : checking
          ? 'Checking the video is readable…'
          : n === 3
            ? 'All three views — the strongest set this can work from.'
            : `${n} of 3 views. Adding the ${missing.join(' and ')} view would let it resolve more.`;
}

for (const slot of slots) {
  const input = slot.querySelector('input[type=file]');
  const drop = slot.querySelector('.slot-drop');
  const idle = slot.querySelector('.slot-idle');
  const preview = slot.querySelector('.slot-preview');
  const nameEl = slot.querySelector('.slot-name');
  const clear = slot.querySelector('.slot-clear');

  const status = slot.querySelector('.slot-status');

  const set = async (file) => {
    if (!file) return;
    slot.file = file;
    slot.readable = undefined;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    idle.hidden = true;
    nameEl.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    slot.classList.add('filled');
    clear.hidden = false;
    status.className = 'slot-status';
    status.textContent = 'Checking this browser can read it…';
    refreshSubmit();

    const result = await probeClip(file);
    if (slot.file !== file) return; // Replaced while we were checking.
    slot.readable = result.ok;
    if (result.ok) {
      status.className = 'slot-status ok';
      status.textContent = `Readable — ${result.duration.toFixed(1)}s, ${result.width}×${result.height}`;
    } else {
      status.className = 'slot-status bad';
      status.textContent =
        `Can't be read here — ${result.short}. iPhone video is HEVC, and if the browser won't decode it, ` +
        `nothing in this page can. Re-export as H.264 MP4, or use the server version, which reads any codec.`;
      slot.probeDetail = result.detail;
    }
    refreshSubmit();
  };

  slot.reset = () => {
    slot.file = null;
    slot.readable = undefined;
    input.value = '';
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.removeAttribute('src');
    preview.hidden = true;
    idle.hidden = false;
    nameEl.textContent = '';
    status.className = 'slot-status';
    status.textContent = '';
    slot.classList.remove('filled');
    clear.hidden = true;
    refreshSubmit();
  };

  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  for (const t of ['dragenter', 'dragover']) drop.addEventListener(t, (e) => { e.preventDefault(); slot.classList.add('dragging'); });
  for (const t of ['dragleave', 'drop']) drop.addEventListener(t, (e) => { e.preventDefault(); slot.classList.remove('dragging'); });
  drop.addEventListener('drop', (e) => set(e.dataTransfer?.files?.[0]));
  input.addEventListener('change', () => set(input.files[0]));
  clear.addEventListener('click', slot.reset);
}
refreshSubmit();

/* --------------------------------------------------------- frame extraction */
function loadVideo(file, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    // Attributes as well as properties: iOS honours the attribute form.
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');

    // iOS will not load or decode media for an element that is outside the
    // document, and display:none stops decoding too — so it goes in the page,
    // hidden by size and opacity instead.
    v.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.append(v);

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      fn(arg);
    };

    // Decoding is the browser's job here, and browsers differ: Safari and Chrome
    // handle iPhone HEVC .mov, Firefox generally does not.
    const rejectWith = (message, short) => {
      const err = new Error(message);
      err.detail = decodeReport(v, file);
      err.short = short;
      v.remove();
      finish(reject, err);
    };

    v.addEventListener('error', () => rejectWith(
      `This browser could not decode ${file.name}. It is almost certainly the video codec, not the file — ` +
      `iPhone .mov clips are HEVC, which Safari and Chrome play but Firefox does not. Try Safari or Chrome, ` +
      `or re-export the clip as H.264 MP4.`,
      'this browser refused to decode it',
    ), { once: true });

    // loadedmetadata can fire before the frame size is known. A zero-sized video
    // does not throw — it silently produces empty canvas exports — so wait for
    // real dimensions rather than for the event alone.
    const ready = () => {
      if (v.videoWidth > 0 && v.videoHeight > 0) finish(resolve, v);
    };
    for (const e of ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough']) v.addEventListener(e, ready);
    // Some browsers reach real dimensions without firing a further event.
    const poll = setInterval(ready, 100);

    v.src = URL.createObjectURL(file);
    v.load();

    // iOS defers loading until playback is attempted, so metadata may otherwise
    // never arrive at all. This runs inside the submit gesture, so it is
    // allowed; if it is refused, the listeners above still cover every browser
    // that loads on its own.
    Promise.resolve(v.play()).then(() => v.pause()).catch(() => {});

    const timer = setTimeout(() => rejectWith(
      `${file.name} never reported a picture size, so no frames could be read from it. Open the details below — ` +
      `they say which layer gave up, which is what decides the fix. The server version sidesteps this entirely: ` +
      `it uses ffmpeg and reads any codec.`,
      'it never reported a picture size',
    ), timeoutMs);
  });
}

/** Belt and braces after load: leave the clip parked at the start, decoded. */
async function primeDecoder(video) {
  try {
    await video.play();
    video.pause();
    video.currentTime = 0;
  } catch {
    // Refused. Seeking usually still works, and the per-frame check below is
    // what actually guarantees we noticed if it did not.
  }
}

function seekTo(video, time) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const onSeeked = () => {
      // 'seeked' means the position moved, not that a frame is on screen.
      // requestVideoFrameCallback fires once one is actually presentable, which
      // is what drawImage needs — without it we can copy the previous frame.
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(finish);
        setTimeout(finish, 400);
      } else {
        finish();
      }
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    setTimeout(finish, 3000); // Never hang the whole run on one bad seek.
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}

/* Motion profile: mean absolute pixel difference between successive samples.
   Same idea as the server's ffmpeg profiler, done with a 64x36 canvas.

   Seeking is the obvious way to do this and the wrong one: each seek on a
   1080p clip costs roughly half a second, so a hundred of them took 57s for a
   14-second video — before a single frame had been captured. Playing the clip
   once at speed and sampling frames as they are presented gives the same coarse
   energy curve for a fraction of the time. */
const PROFILE_W = 64, PROFILE_H = 36;
const PROFILE_GAP = 0.12;   // seconds of video time between samples
const PROFILE_RATE = 6;     // playback speed; browsers clamp this as they see fit

function profileCanvas() {
  const c = document.createElement('canvas');
  c.width = PROFILE_W;
  c.height = PROFILE_H;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function meanAbsDiff(a, b) {
  let sum = 0;
  for (let p = 0; p < a.length; p += 4) sum += Math.abs(a[p] - b[p]);
  return sum / (a.length / 4);
}

function profileByPlayback(video, onProgress) {
  return new Promise((resolve) => {
    const [, ctx] = profileCanvas();
    const profile = [];
    let prev = null;
    let lastSample = -Infinity;
    let done = false;

    const stop = () => {
      if (done) return;
      done = true;
      video.pause();
      video.playbackRate = 1;
      resolve(profile.length > 3 ? profile : null);
    };

    const onFrame = (_now, meta) => {
      const t = meta.mediaTime;
      if (t - lastSample >= PROFILE_GAP) {
        lastSample = t;
        ctx.drawImage(video, 0, 0, PROFILE_W, PROFILE_H);
        const data = ctx.getImageData(0, 0, PROFILE_W, PROFILE_H).data;
        if (prev) profile.push({ time: t, value: meanAbsDiff(data, prev) });
        prev = data;
        onProgress?.(Math.min(99, Math.round((t / video.duration) * 100)));
      }
      if (video.ended || done) stop();
      else video.requestVideoFrameCallback(onFrame);
    };

    video.addEventListener('ended', stop, { once: true });
    setTimeout(stop, 30000); // Whatever happens, do not stall the run here.

    video.currentTime = 0;
    video.muted = true;
    video.playbackRate = PROFILE_RATE;
    Promise.resolve(video.play())
      .then(() => video.requestVideoFrameCallback(onFrame))
      .catch(stop); // Playback refused — the seek fallback below still applies.
  });
}

/** Fallback for browsers without requestVideoFrameCallback. Deliberately
 *  coarse: seeks are expensive, so this samples far fewer points. */
async function profileBySeeking(video, onProgress) {
  const [, ctx] = profileCanvas();
  const total = Math.min(Math.floor(video.duration * 4), 45);
  if (total < 4) return null;

  const profile = [];
  let prev = null;
  for (let i = 0; i < total; i++) {
    const t = (i / total) * video.duration;
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, PROFILE_W, PROFILE_H);
    const data = ctx.getImageData(0, 0, PROFILE_W, PROFILE_H).data;
    if (prev) profile.push({ time: t, value: meanAbsDiff(data, prev) });
    prev = data;
    if (i % 5 === 0) onProgress?.(Math.round((i / total) * 100));
  }
  return profile;
}

async function motionProfile(video, onProgress) {
  if (video.duration < 1) return null;
  if (typeof video.requestVideoFrameCallback === 'function') {
    const profile = await profileByPlayback(video, onProgress);
    if (profile) return profile;
  }
  return profileBySeeking(video, onProgress);
}

function pickBurstStarts(profile, { usableStart, usableEnd, span, count }) {
  const latest = usableEnd - span;
  if (latest <= usableStart) return [usableStart];
  const evenly = () =>
    count === 1
      ? [usableStart + (latest - usableStart) / 2]
      : Array.from({ length: count }, (_, i) => usableStart + ((latest - usableStart) / (count - 1)) * i);
  if (!profile?.length) return evenly();

  const stats = (start) => {
    const inside = profile.filter((s) => s.time >= start && s.time < start + span);
    if (!inside.length) return null;
    const mean = inside.reduce((a, s) => a + s.value, 0) / inside.length;
    const varc = inside.reduce((a, s) => a + (s.value - mean) ** 2, 0) / inside.length;
    return mean - Math.sqrt(varc);
  };

  const candidates = [];
  for (let t = usableStart; t <= latest + 1e-9; t += 0.1) {
    const score = stats(t);
    if (score != null) candidates.push({ start: t, score });
  }
  if (!candidates.length) return evenly();
  candidates.sort((a, b) => b.score - a.score);

  const greedy = (gap) => {
    const picked = [];
    for (const c of candidates) {
      if (picked.length >= count) break;
      if (picked.every((p) => Math.abs(p - c.start) >= gap)) picked.push(c.start);
    }
    return picked;
  };
  let out = [];
  for (const gap of [span * 3, span * 2, span * 1.25, span]) {
    out = greedy(gap);
    if (out.length >= count) break;
  }
  for (const t of evenly()) {
    if (out.length >= count) break;
    if (out.every((p) => Math.abs(p - t) >= span * 0.5)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/** A real JPEG of a video frame is tens of KB. Anything this small is a
 *  failed export, not a dark frame — toDataURL returns the string "data:,"
 *  when it has nothing to encode, which yields an empty payload. */
const MIN_FRAME_CHARS = 512;

function grabFrame(source, canvas, ctx) {
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '';
}

/** Burst layout, shared by both decode paths so they sample identically. */
function planBursts(duration, perView, gait, profile) {
  const g = String(gait ?? '').toLowerCase();
  const span = g.includes('walk') && g.includes('trot') ? BURST_SPAN_BY_GAIT.default
    : g.includes('walk') ? BURST_SPAN_BY_GAIT.walk
    : g.includes('trot') ? BURST_SPAN_BY_GAIT.trot
    : g.includes('canter') ? BURST_SPAN_BY_GAIT.canter
    : BURST_SPAN_BY_GAIT.default;

  const usableStart = duration * 0.05;
  const usableEnd = duration * 0.95;
  const bursts = Math.max(1, Math.min(BURSTS, Math.floor((usableEnd - usableStart) / (span * 1.5)) || 1));
  const perBurst = Math.max(2, Math.floor(perView / bursts));
  const innerStep = span / (perBurst - 1);
  const starts = pickBurstStarts(profile, { usableStart, usableEnd, span, count: bursts });
  return { bursts, perBurst, innerStep, span, starts };
}

function burstLabels(starts, perBurst, innerStep, duration) {
  const plan = [];
  for (const [b, start] of starts.entries()) {
    for (let i = 0; i < perBurst; i++) {
      plan.push({
        time: Math.min(start + innerStep * i, Math.max(0, duration - 0.05)),
        label: `burst ${b + 1}, frame ${i + 1}`,
      });
    }
  }
  return plan;
}

/**
 * Second decode path, for clips the media element will not open.
 *
 * iPhones record HEVC in a QuickTime container, and some browsers refuse that
 * combination outright — the demuxer gives up before the decoder is consulted.
 * Parsing the container here and feeding samples to VideoDecoder gets those
 * clips read on any device whose platform can decode HEVC at all.
 */
async function readFramesViaWebCodecs(file, opened, view, perView, gait, onProgress) {
  const { track } = opened;
  const meta = { duration: track.duration, width: track.width, height: track.height };
  if (!(meta.duration > 1.5)) throw new Error(`${file.name} is only ${meta.duration.toFixed(1)}s — too short to show a stride.`);

  onProgress(`${view}: reading the video directly…`);

  // Profile pass: one forward decode, sampled down to the small canvas.
  const [, pctx] = profileCanvas();
  const profileTimes = [];
  for (let t = 0; t < meta.duration; t += PROFILE_GAP) profileTimes.push(t);
  const samples = await decodeFramesAt(file, opened, profileTimes, (frame) => {
    pctx.drawImage(frame, 0, 0, PROFILE_W, PROFILE_H);
    return pctx.getImageData(0, 0, PROFILE_W, PROFILE_H).data;
  }, (n, total) => onProgress(`${view}: profiling movement… ${Math.round((n / total) * 100)}%`));

  const profile = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i] && samples[i - 1]) profile.push({ time: profileTimes[i], value: meanAbsDiff(samples[i], samples[i - 1]) });
  }

  const { bursts, perBurst, innerStep, span, starts } = planBursts(meta.duration, perView, gait, profile.length > 3 ? profile : null);
  const plan = burstLabels(starts, perBurst, innerStep, meta.duration);

  const scale = Math.min(1, MAX_EDGE / Math.max(meta.width, meta.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(meta.width * scale);
  canvas.height = Math.round(meta.height * scale);
  const ctx = canvas.getContext('2d');

  let captured = 0;
  const encoded = await decodeFramesAt(file, opened, plan.map((p) => p.time), (frame) => {
    captured++;
    onProgress(`${view}: capturing frames… ${captured}/${plan.length}`);
    return grabFrame(frame, canvas, ctx);
  });

  const frames = [];
  for (const [i, p] of plan.entries()) {
    const base64 = encoded[i];
    if (!base64 || base64.length < MIN_FRAME_CHARS) {
      throw new Error(`The decoder produced no picture for ${file.name} at ${p.time.toFixed(1)}s.`);
    }
    frames.push({ index: frames.length, label: `${p.label} — t=${p.time.toFixed(2)}s`, base64 });
  }

  return { view, meta, frames, sampling: { bursts, perBurst, innerStep, span, motionGuided: profile.length > 3 } };
}

/**
 * Can this browser actually read this clip? Answered at selection time, in a
 * couple of seconds, because the alternative is letting someone fill in the
 * whole form and wait — iPhone video is HEVC, and a browser that cannot decode
 * HEVC cannot be worked around from inside the page.
 */
async function probeClip(file) {
  let video;
  try {
    video = await loadVideo(file, 12000);
  } catch (err) {
    // The media element refused it. That is routine for iPhone HEVC in a .mov,
    // and says nothing about whether the platform can decode the video itself.
    const wc = await openWithWebCodecs(file);
    if (wc.ok) {
      return { ok: true, path: 'webcodecs', duration: wc.track.duration, width: wc.track.width, height: wc.track.height };
    }
    return { ok: false, short: `${err.short}, and ${wc.reason}`, detail: err.detail };
  }
  try {
    await primeDecoder(video);
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    await seekTo(video, Math.min(0.5, video.duration / 2));
    // Opening the container is not the same as decoding a picture from it.
    if (grabFrame(video, canvas, ctx).length < 128) {
      return { ok: false, short: 'it opened, but no picture could be read from it', detail: decodeReport(video, file) };
    }
    return { ok: true, duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(video.src);
    video.remove();
  }
}

async function extractClip(file, view, perView, gait, onProgress) {
  let video;
  try {
    video = await loadVideo(file);
  } catch (err) {
    const wc = await openWithWebCodecs(file);
    if (!wc.ok) {
      err.message = `${err.message} Decoding it directly did not work either: ${wc.reason}.`;
      throw err;
    }
    return readFramesViaWebCodecs(file, wc, view, perView, gait, onProgress);
  }
  try {
    return await readFrames(video, file, view, perView, gait, onProgress);
  } finally {
    // The element lives in the document so iOS will decode it; take it back out
    // whatever happens, so a failed clip cannot leave one behind.
    URL.revokeObjectURL(video.src);
    video.remove();
  }
}

async function readFrames(video, file, view, perView, gait, onProgress) {
  await primeDecoder(video);
  // videoWidth/videoHeight are display dimensions — the browser has already
  // applied any rotation, so portrait phone clips come out upright.
  const meta = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  if (!(meta.duration > 1.5)) throw new Error(`${file.name} is only ${meta.duration.toFixed(1)}s — too short to show a stride.`);
  if (!(meta.width > 0 && meta.height > 0)) {
    throw new Error(`${file.name} reported no picture size, so every frame would come out blank. Try re-exporting it as H.264 MP4.`);
  }

  onProgress(`${view}: profiling movement…`);
  const profile = await motionProfile(video, (pct) => onProgress(`${view}: profiling movement… ${pct}%`));

  const { bursts, perBurst, innerStep, span, starts } = planBursts(meta.duration, perView, gait, profile);

  const scale = Math.min(1, MAX_EDGE / Math.max(meta.width, meta.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(meta.width * scale);
  canvas.height = Math.round(meta.height * scale);
  const ctx = canvas.getContext('2d');

  const frames = [];
  let n = 0;
  for (const [b, start] of starts.entries()) {
    for (let i = 0; i < perBurst; i++) {
      const t = start + innerStep * i;
      await seekTo(video, t);
      let base64 = grabFrame(video, canvas, ctx);

      // One retry: on a slow decoder the first export can land before the frame
      // does. Nudging the time forces a fresh seek rather than a repeat draw.
      if (base64.length < MIN_FRAME_CHARS) {
        await new Promise((r) => setTimeout(r, 150));
        await seekTo(video, Math.min(t + 0.03, meta.duration - 0.05));
        base64 = grabFrame(video, canvas, ctx);
      }

      // Never let an empty image reach the API — it fails the request as a
      // whole, after every other frame has already been captured.
      if (base64.length < MIN_FRAME_CHARS) {
        throw new Error(
          `This browser returned a blank frame for ${file.name} at ${t.toFixed(1)}s, so the clip cannot be read here. ` +
          `Safari and Chrome handle iPhone HEVC video; Firefox does not. Try one of those, or re-export as H.264 MP4.`,
        );
      }

      frames.push({
        index: frames.length,
        label: `burst ${b + 1}, frame ${i + 1} — t=${t.toFixed(2)}s`,
        base64,
      });
      n++;
      onProgress(`${view}: capturing frames… ${n}/${bursts * perBurst}`);
    }
  }

  return { view, meta, frames, sampling: { bursts, perBurst, innerStep, span, motionGuided: Boolean(profile) } };
}

/* -------------------------------------------------------------- claude api */
async function callClaude(body, onText) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Your API key was rejected. Check it is current and not revoked.');
    if (res.status === 429) throw new Error('Rate limited by the Anthropic API. Wait a minute and try again.');
    if (res.status === 400 && detail.includes('credit')) throw new Error('That key has no credit available.');
    throw new Error(`Anthropic API error ${res.status}. ${detail.slice(0, 200)}`);
  }

  // Accumulate the streamed content blocks.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const blocks = [];
  let stopReason = null;
  let usage = {};

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === 'content_block_start') blocks[ev.index] = { ...ev.content_block, text: ev.content_block.text ?? '' };
      if (ev.type === 'content_block_delta') {
        const b = (blocks[ev.index] ??= { type: 'text', text: '' });
        if (ev.delta.type === 'text_delta') { b.text += ev.delta.text; onText?.(ev.delta.text); }
        if (ev.delta.type === 'input_json_delta') b.partial = (b.partial ?? '') + ev.delta.partial_json;
      }
      if (ev.type === 'message_delta') { stopReason = ev.delta?.stop_reason ?? stopReason; usage = { ...usage, ...ev.usage }; }
    }
  }
  return { content: blocks.filter(Boolean), stopReason, usage };
}

async function analyse(clips, intake) {
  const knowledge = CONFIG.knowledge;

  const clipBlocks = [];
  for (const clip of clips) {
    clipBlocks.push({
      type: 'text',
      text:
        `\n===== ${clip.view.toUpperCase()} VIEW — ${clip.frames.length} frames from ${clip.meta.duration.toFixed(1)}s ` +
        `at ${clip.meta.width}x${clip.meta.height} =====\n${CONFIG.viewPurpose[clip.view] ?? ''}\n` +
        `The frames are NOT evenly spread. They were captured as ${clip.sampling.bursts} dense burst(s) of ` +
        `${clip.sampling.perBurst}, ${clip.sampling.innerStep.toFixed(2)}s apart inside a burst — fast enough to ` +
        `resolve one stride cycle. Frames within a burst ARE consecutive stride phases and may be compared ` +
        `directly; frames in different bursts are seconds apart and must not be.`,
    });
    for (const f of clip.frames) {
      clipBlocks.push({ type: 'text', text: `[${clip.view}] frame ${f.index + 1}/${clip.frames.length} — ${f.label}` });
      clipBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.base64 } });
    }
  }

  const background = Object.entries(intake)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '- (No background supplied.)';

  // ---- pass 1: observation + web research
  log('Examining gait across the sampled frames…');
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: [
        'Analyse this horse for signs of lameness or gait abnormality.', '',
        clips.length === 1 ? 'ONE camera view was supplied.'
          : `${clips.length} camera views of the SAME horse in the same session were supplied: ${clips.map((c) => c.view).join(', ')}.`,
        '', 'Owner-supplied background:', background,
      ].join('\n') },
      ...clipBlocks,
      { type: 'text', text: 'Work through the five steps in order. Where more than one view was supplied, compare them explicitly and state whether they agree. Finish with a short ranked shortlist of candidate diagnoses and the reasoning behind that ordering.' },
    ],
  }];

  let obs;
  for (let attempt = 0; attempt < 5; attempt++) {
    obs = await callClaude({
      model: MODEL, max_tokens: 32000,
      system: [{ type: 'text', text: `${CONFIG.observerSystem}\n\n${knowledge}` }],
      output_config: { effort: 'high' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      messages,
    });
    if (obs.stopReason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: obs.content });
    log('Continuing research…');
  }

  const findings = obs.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
  const sources = [];
  for (const b of obs.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ url: r.url, title: r.title ?? r.url });
    }
  }
  if (sources.length) log(`Cross-referenced ${sources.length} published sources.`);

  // ---- pass 2: structured report, in two calls
  // The full report compiles to a grammar the API rejects as too large, so the
  // assessment and the plan are requested separately and merged. The plan call
  // is given the finished assessment, so it is written against the real ranking.
  const context = [
    `Views supplied: ${clips.map((c) => `${c.view} (${c.meta.duration.toFixed(1)}s, ${c.frames.length} frames)`).join('; ')}.`,
    '', 'Owner-supplied background:', background, '',
    '--- OBSERVATION AND RESEARCH PASS ---', findings, '--- END ---',
  ].join('\n');

  const structured = async (schema, prompt) => {
    const res = await callClaude({
      model: MODEL, max_tokens: 32000,
      system: [{ type: 'text', text: `${CONFIG.reportSystem}\n\n${knowledge}` }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new Error('The model returned an empty report.');
    return JSON.parse(text);
  };

  log('Building the ranked differential…');
  const assessment = await structured(CONFIG.assessmentSchema,
    `${context}\n\nProduce the assessment section of the screening report: emergency status, what each view contributed, footage quality, the gait assessment, and the ranked differential.`);

  log('Writing the treatment and conditioning plan…');
  const plan = await structured(CONFIG.planSchema, [
    context, '',
    '--- ASSESSMENT ALREADY PRODUCED ---', JSON.stringify(assessment, null, 2), '--- END ---', '',
    'Now produce the remaining sections: the stride optimisation plan, the checklist to take to the',
    'vet, and the limitations of this assessment. Write the plan against the differential above —',
    'it must make sense for the top-ranked conditions specifically, and stay conditional on',
    'veterinary clearance.',
  ].join('\n'));

  return {
    report: { ...assessment, ...plan },
    observation: findings,
    sources,
    meta: {
      model: MODEL,
      views: clips.map((c) => c.view),
      frameCount: clips.reduce((n, c) => n + c.frames.length, 0),
      videoDuration: clips.reduce((d, c) => d + c.meta.duration, 0),
      webResearch: true,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** iOS allows only a handful of live video decoders at once, and each filled
 *  slot preview holds one. A fourth element can then fail to load with no error
 *  at all — it simply never reports a size. Release the previews for the
 *  duration of the read and put them back afterwards. */
function releasePreviews() {
  const held = [];
  for (const slot of slots) {
    const preview = slot.querySelector('.slot-preview');
    if (!preview?.src) continue;
    held.push([preview, preview.src]);
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
  }
  return () => {
    for (const [preview, src] of held) preview.src = src;
  };
}

/* ------------------------------------------------- keeping the run alive */
// The whole analysis happens in this tab and takes eight minutes or more. On a
// phone that is long enough for the screen to lock, which suspends the page and
// kills the run. Hold a screen wake lock for the duration where the browser
// offers one, and warn before an accidental navigation throws the work away.
let running = false;
let wakeLock = null;

async function acquireLock() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // Refused or unsupported — the run still works if the screen stays on.
  }
}

// iOS releases the lock whenever the tab is hidden, so take it again on return.
document.addEventListener('visibilitychange', () => {
  if (running && document.visibilityState === 'visible' && !wakeLock) acquireLock();
});

window.addEventListener('beforeunload', (e) => {
  if (running) e.preventDefault();
});

async function releaseLock() {
  try { await wakeLock?.release(); } catch { /* already gone */ }
  wakeLock = null;
}

/* ------------------------------------------------------------------ submit */
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const picked = chosen();
  if (!picked.length) return;

  $('#log').replaceChildren();
  show('working');
  running = true;
  await acquireLock();
  if (!wakeLock) log('Note: this browser will not hold the screen awake — keep the tab in front and stop the screen locking.');

  const intake = {};
  for (const [k, v] of new FormData(e.target).entries()) if (typeof v === 'string' && v.trim()) intake[k] = v.trim();

  const restorePreviews = releasePreviews();

  try {
    const perView = Math.min(18, Math.max(6, Math.floor(FRAME_BUDGET / picked.length)));
    const clips = [];
    let lastLine = null;
    for (const slot of picked) {
      const clip = await extractClip(slot.file, slot.dataset.view, perView, intake.gait, (msg) => {
        if (lastLine) lastLine.textContent = msg;
        else { log(msg); lastLine = $('#log').lastChild; }
      });
      lastLine = null;
      log(`${clip.view}: ${clip.frames.length} frames in ${clip.sampling.bursts} burst(s) from ${clip.meta.duration.toFixed(1)}s${clip.sampling.motionGuided ? ', placed on the most active passages' : ''}.`);
      clips.push(clip);
    }
    restorePreviews();
    const result = await analyse(clips, intake);
    renderReport(result);
  } catch (err) {
    restorePreviews();
    fail(err.message ?? String(err), err.detail);
  } finally {
    running = false;
    await releaseLock();
  }
});

$('#restart').addEventListener('click', () => { slots.forEach((s) => s.reset()); show('upload'); });
$('#retry').addEventListener('click', () => show('upload'));
$('#print').addEventListener('click', () => window.print());

/* ------------------------------------------------------------------ report */
__RENDERER__

/* --------------------------------------------------------------- start-up */
if (apiKey) { $('#key-input').value = apiKey; show('upload'); } else show('key');
