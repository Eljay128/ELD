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
function fail(msg) {
  $('#error-message').textContent = msg;
  show('error');
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
  const n = chosen().length;
  $('#submit').disabled = n === 0;
  const missing = slots.filter((s) => !s.file).map((s) => s.dataset.view);
  $('#submit-note').textContent =
    n === 0
      ? 'Add at least one video to begin.'
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

  const set = (file) => {
    if (!file) return;
    slot.file = file;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    idle.hidden = true;
    nameEl.textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
    slot.classList.add('filled');
    clear.hidden = false;
    refreshSubmit();
  };
  slot.reset = () => {
    slot.file = null;
    input.value = '';
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.removeAttribute('src');
    preview.hidden = true;
    idle.hidden = false;
    nameEl.textContent = '';
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
function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.addEventListener('loadedmetadata', () => resolve(v), { once: true });
    // Decoding is the browser's job here, and browsers differ: Safari and Chrome
    // handle iPhone HEVC .mov, Firefox generally does not.
    v.addEventListener('error', () => reject(new Error(
      `This browser could not decode ${file.name}. It is almost certainly the video codec, not the file — ` +
      `iPhone .mov clips are HEVC, which Safari and Chrome play but Firefox does not. Try Safari or Chrome, ` +
      `or re-export the clip as H.264 MP4.`,
    )), { once: true });
  });
}

function seekTo(video, time) {
  return new Promise((resolve) => {
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}

/** Motion profile: mean absolute pixel difference between successive samples.
 *  Same idea as the server's ffmpeg profiler, done with a 64x36 canvas. */
async function motionProfile(video, onProgress) {
  const w = 64, h = 36;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  const fps = 8;
  const total = Math.min(Math.floor(video.duration * fps), 110);
  if (total < 4) return null;

  const profile = [];
  let prev = null;
  for (let i = 0; i < total; i++) {
    const t = (i / total) * video.duration;
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    if (prev) {
      let sum = 0;
      for (let p = 0; p < data.length; p += 4) sum += Math.abs(data[p] - prev[p]);
      profile.push({ time: t, value: sum / (data.length / 4) });
    }
    prev = data;
    if (i % 20 === 0) onProgress?.(Math.round((i / total) * 100));
  }
  return profile;
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

async function extractClip(file, view, perView, gait, onProgress) {
  const video = await loadVideo(file);
  // videoWidth/videoHeight are display dimensions — the browser has already
  // applied any rotation, so portrait phone clips come out upright.
  const meta = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  if (!(meta.duration > 1.5)) throw new Error(`${file.name} is only ${meta.duration.toFixed(1)}s — too short to show a stride.`);

  onProgress(`${view}: profiling movement…`);
  const profile = await motionProfile(video, (pct) => onProgress(`${view}: profiling movement… ${pct}%`));

  const g = String(gait ?? '').toLowerCase();
  const span = g.includes('walk') && g.includes('trot') ? BURST_SPAN_BY_GAIT.default
    : g.includes('walk') ? BURST_SPAN_BY_GAIT.walk
    : g.includes('trot') ? BURST_SPAN_BY_GAIT.trot
    : g.includes('canter') ? BURST_SPAN_BY_GAIT.canter
    : BURST_SPAN_BY_GAIT.default;

  const usableStart = meta.duration * 0.05;
  const usableEnd = meta.duration * 0.95;
  const bursts = Math.max(1, Math.min(BURSTS, Math.floor((usableEnd - usableStart) / (span * 1.5)) || 1));
  const perBurst = Math.max(2, Math.floor(perView / bursts));
  const innerStep = span / (perBurst - 1);
  const starts = pickBurstStarts(profile, { usableStart, usableEnd, span, count: bursts });

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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        index: frames.length,
        label: `burst ${b + 1}, frame ${i + 1} — t=${t.toFixed(2)}s`,
        base64: canvas.toDataURL('image/jpeg', 0.82).split(',')[1],
      });
      n++;
      onProgress(`${view}: capturing frames… ${n}/${bursts * perBurst}`);
    }
  }

  URL.revokeObjectURL(video.src);
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

  // ---- pass 2: structured report
  log('Building the ranked differential and treatment plan…');
  const rep = await callClaude({
    model: MODEL, max_tokens: 32000,
    system: [{ type: 'text', text: `${CONFIG.reportSystem}\n\n${knowledge}` }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema: CONFIG.schema } },
    messages: [{ role: 'user', content: [
      `Views supplied: ${clips.map((c) => `${c.view} (${c.meta.duration.toFixed(1)}s, ${c.frames.length} frames)`).join('; ')}.`,
      '', 'Owner-supplied background:', background, '',
      '--- OBSERVATION AND RESEARCH PASS ---', findings, '--- END ---', '',
      'Produce the structured screening report.',
    ].join('\n') }],
  });

  const text = rep.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('The model returned an empty report.');
  return {
    report: JSON.parse(text),
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

/* ------------------------------------------------------------------ submit */
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const picked = chosen();
  if (!picked.length) return;

  $('#log').replaceChildren();
  show('working');

  const intake = {};
  for (const [k, v] of new FormData(e.target).entries()) if (typeof v === 'string' && v.trim()) intake[k] = v.trim();

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
    const result = await analyse(clips, intake);
    renderReport(result);
  } catch (err) {
    fail(err.message ?? String(err));
  }
});

$('#restart').addEventListener('click', () => { slots.forEach((s) => s.reset()); show('upload'); });
$('#retry').addEventListener('click', () => show('upload'));
$('#print').addEventListener('click', () => window.print());

/* ------------------------------------------------------------------ report */
__RENDERER__

/* --------------------------------------------------------------- start-up */
if (apiKey) { $('#key-input').value = apiKey; show('upload'); } else show('key');
