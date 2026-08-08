const $ = (sel) => document.querySelector(sel);

const views = {
  upload: $('#view-upload'),
  working: $('#view-working'),
  report: $('#view-report'),
  error: $('#view-error'),
};

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fail(message) {
  $('#error-message').textContent = message;
  show('error');
}

/** Text from the model goes through here — never innerHTML. */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const list = (items, className) => {
  const ul = el('ul', className);
  for (const item of items ?? []) ul.append(el('li', null, item));
  return ul;
};

/* The screening notice lives in one <template> and is cloned into each mount
   point, so the copy above the analyze button and the copy below the report can
   never drift apart. */
for (const mount of document.querySelectorAll('[data-notice]')) {
  mount.replaceWith(document.querySelector('#screening-notice').content.cloneNode(true));
}

// ------------------------------------------------------------------ upload

const submitBtn = $('#submit');
const slots = [...document.querySelectorAll('.slot')];

fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    const limit = document.querySelector('#size-limit');
    if (limit) limit.textContent = `up to ${cfg.maxUploadMb} MB`;
  })
  .catch(() => {});

function countChosen() {
  return slots.filter((s) => s.querySelector('input[type=file]').files.length).length;
}

function refreshSubmit() {
  const n = countChosen();
  submitBtn.disabled = n === 0;
  $('#submit-note').textContent =
    n === 0
      ? 'Add at least one video to begin.'
      : n === 3
        ? 'All three views — the strongest set this can work from.'
        : `${n} of 3 views. Adding the ${slots
            .filter((s) => !s.querySelector('input[type=file]').files.length)
            .map((s) => s.dataset.view)
            .join(' and ')} view would let it resolve more.`;
}

function wireSlot(slot) {
  const input = slot.querySelector('input[type=file]');
  const drop = slot.querySelector('.slot-drop');
  const idle = slot.querySelector('.slot-idle');
  const preview = slot.querySelector('.slot-preview');
  const nameEl = slot.querySelector('.slot-name');
  const clear = slot.querySelector('.slot-clear');

  const set = (file) => {
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;

    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    idle.hidden = true;
    nameEl.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    slot.classList.add('filled');
    clear.hidden = false;
    refreshSubmit();
  };

  const reset = () => {
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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      slot.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      slot.classList.remove('dragging');
    });
  }
  drop.addEventListener('drop', (e) => set(e.dataTransfer?.files?.[0]));
  input.addEventListener('change', () => set(input.files[0]));
  clear.addEventListener('click', reset);

  slot.reset = reset;
}

slots.forEach(wireSlot);
refreshSubmit();

function clearAll() {
  slots.forEach((s) => s.reset());
}

// ---------------------------------------------------------------- pipeline

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (countChosen() === 0) return;

  $('#log').replaceChildren();
  show('working');
  addLog(`Uploading ${countChosen()} video${countChosen() > 1 ? 's' : ''}…`);

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: new FormData(e.target) });
    const data = await res.json();
    if (!res.ok) return fail(data.error ?? 'Upload failed.');
    streamJob(data.jobId);
  } catch {
    fail('Could not reach the server. Is it still running?');
  }
});

function addLog(message) {
  $('#log').append(el('li', null, message));
}

function streamJob(jobId) {
  const source = new EventSource(`/api/analyze/${jobId}/stream`);

  source.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'progress') addLog(payload.message);
    if (payload.type === 'done') {
      source.close();
      renderReport(payload.result);
    }
    if (payload.type === 'error') {
      source.close();
      fail(payload.message);
    }
  };

  source.onerror = () => {
    source.close();
    fail('Lost connection to the server during analysis.');
  };
}

// ------------------------------------------------------------------ report

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sentenceCase = (s) => `${String(s ?? '').charAt(0).toUpperCase()}${String(s ?? '').slice(1)}`;

/**
 * A collapsible report section.
 *
 * The summary line has to carry the finding itself, not just a label — a page
 * of headings that all read "Footage quality" is no better than the wall of
 * text it replaced. Each one below answers "so what?" in a single line.
 */
function section(title, summary, body, { open = false } = {}) {
  const box = el('details', 'sec');
  box.open = open;

  const head = el('summary');
  head.append(el('span', 'sec-title', title));
  if (summary) head.append(el('span', 'sec-summary', summary));
  box.append(head);

  const wrap = el('div', 'sec-body');
  wrap.append(body);
  box.append(wrap);
  return box;
}

// ---- summary lines: the single most useful fact from each section

function viewsSummary(views) {
  const used = views.filter((v) => v.view !== 'not supplied' && v.usable);
  const lost = views.length - used.length;
  if (!lost) return `All ${plural(used.length, 'view')} usable`;
  return `${used.length} of 3 views usable · ${lost} missing or unusable`;
}

function qualitySummary(q) {
  const rating = sentenceCase(q.rating);
  const n = q.issues?.length ?? 0;
  if (!n) return `${rating} — nothing limiting the assessment`;
  return `${rating} · ${plural(n, 'limitation')} noted`;
}

function gaitSummary(g) {
  const grade = g.aaepGrade === 'indeterminate' ? 'Grade unclear' : `AAEP grade ${g.aaepGrade}`;
  const limb = g.affectedLimbs?.find((l) => !/undetermined/i.test(l.limb));
  return limb
    ? `${grade} · ${limb.limb}, ${limb.confidence} confidence`
    : `${grade} · no limb could be identified`;
}

function dxSummary(differential) {
  const top = differential?.[0];
  if (!top) return '';
  return `Most likely: ${top.condition} (${top.likelihoodRating}%) · ${plural(differential.length, 'candidate')} considered`;
}

function planSummary(plan) {
  const phases = plan.phases?.length ?? 0;
  return `${plural(phases, 'phase')} · start only once your vet has cleared the horse to work`;
}

// ---- the report itself

function renderReport({ report, observation, sources, meta }) {
  const root = $('#report');
  root.replaceChildren();

  // The emergency banner is the one thing that must never sit behind a click.
  if (report.emergency?.isEmergency) {
    const box = el('div', 'notice notice-danger');
    box.append(el('strong', null, 'Call your veterinarian today.'));
    box.append(
      el('p', null, 'This footage or history shows at least one sign that should not wait:'),
      list(report.emergency.reasons),
    );
    root.append(box);
  }

  const head = el('div', 'report-head');
  head.append(el('h2', null, 'Gait screening report'));
  root.append(head);

  const strip = el('ul', 'meta-strip');
  for (const item of [
    meta.views?.length ? `${meta.views.join(' + ')} view${meta.views.length > 1 ? 's' : ''}` : 'single view',
    `${meta.frameCount} frames analyzed`,
    `${meta.videoDuration.toFixed(1)}s of footage`,
    meta.webResearch ? 'Web research: on' : 'Web research: off',
    new Date(meta.generatedAt).toLocaleString(),
  ]) {
    strip.append(el('li', null, item));
  }
  root.append(strip);

  const map = renderBodyMap(report.differential);
  if (map) root.append(map);

  const controls = el('div', 'sec-controls');
  const toggle = el('button', 'link-btn', 'Expand all');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    const boxes = [...root.querySelectorAll('details.sec')];
    const opening = boxes.some((b) => !b.open);
    for (const b of boxes) b.open = opening;
    toggle.textContent = opening ? 'Collapse all' : 'Expand all';
  });
  controls.append(toggle);
  root.append(controls);

  if (report.viewsAnalyzed?.length) {
    root.append(section('Views', viewsSummary(report.viewsAnalyzed), renderViews(report.viewsAnalyzed)));
  }
  root.append(section('Footage quality', qualitySummary(report.videoQuality), renderVideoQuality(report.videoQuality)));
  root.append(section('What the gait shows', gaitSummary(report.gaitAssessment), renderGait(report.gaitAssessment)));
  root.append(section('Possible diagnoses', dxSummary(report.differential), renderDifferential(report.differential)));
  root.append(section('Getting back to a full stride', planSummary(report.strideOptimizationPlan), renderPlan(report.strideOptimizationPlan)));

  if (report.vetVisitChecklist?.length) {
    root.append(section(
      'Take this to your vet',
      `${plural(report.vetVisitChecklist.length, 'question')} to raise at the appointment`,
      list(report.vetVisitChecklist, 'obs-list'),
    ));
  }

  if (report.limitations?.length) {
    root.append(section(
      'What this cannot tell you',
      `${plural(report.limitations.length, 'thing')} video alone cannot settle`,
      list(report.limitations, 'obs-list'),
    ));
  }

  if (sources?.length) {
    const ul = el('ul', 'sources');
    for (const src of sources) {
      const li = el('li');
      const a = el('a', null, src.title);
      a.href = src.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a);
      ul.append(li);
    }
    root.append(section('Sources consulted', `${plural(sources.length, 'published source')} cross-referenced`, ul));
  }

  if (observation) {
    root.append(section(
      'Full working notes',
      'Everything the model saw, frame by frame, before ranking anything',
      el('pre', null, observation),
    ));
  }

  show('report');
}

// A collapsed report prints as a page of headings, so open everything first and
// put it back afterwards — the reader still gets the tidy version on screen.
let printRestore = null;
window.addEventListener('beforeprint', () => {
  const boxes = [...document.querySelectorAll('#report details')];
  printRestore = boxes.filter((b) => !b.open);
  for (const b of boxes) b.open = true;
});
window.addEventListener('afterprint', () => {
  for (const b of printRestore ?? []) b.open = false;
  printRestore = null;
});

function renderViews(views) {
  const ul = el('ul', 'limb-list');
  for (const v of views) {
    const li = el('li');
    const missing = v.view === 'not supplied' || !v.usable;
    li.append(el('span', 'limb-name', v.view));
    li.append(el('span', `conf ${missing ? 'low' : 'high'}`, missing ? 'not usable' : 'used'));
    li.append(el('p', 'limb-evidence', v.contributed));
    ul.append(li);
  }
  return ul;
}

function renderVideoQuality(q) {
  const box = el('div');

  const rating = el('p');
  rating.append(el('strong', null, sentenceCase(q.rating)));
  rating.append(
    document.createTextNode(
      q.rating === 'good'
        ? ' — this clip supports a reasonable assessment.'
        : ' — read the findings below with that in mind.',
    ),
  );
  box.append(rating);

  if (q.issues?.length) {
    box.append(el('h5', null, 'Limitations of this clip'), list(q.issues, 'obs-list'));
  }
  if (q.suggestions?.length) {
    box.append(el('h5', null, 'For a better clip next time'), list(q.suggestions, 'obs-list'));
  }
  return box;
}

/* ---- body map geometry ------------------------------------------------- */
/* Standing horse for the body map: traced from a supplied line drawing with
   tools/trace-silhouette.mjs --linework, mirrored to face the same way as the
   trotting horse, with a mane fitted to the traced crest. */
const HORSE_VIEWBOX = "0 0 120 88";

const HORSE_BODY = "M95.03 2L90.51 2.17L83.64 4.01L78.61 6.36L72.24 9.88L71.73 9.88L71.57 10.21L66.03 11.72L61.68 14.07L57.32 15.58L54.47 15.91L50.45 15.75L36.03 13.06L28.99 12.9L25.8 13.4L22.12 14.57L21.95 14.91L21.28 14.91L19.94 15.75L19.43 15.75L19.27 16.08L18.76 16.08L18.43 16.58L17.25 16.92L14.07 19.27L12.56 21.45L12.56 22.62L11.72 22.79L8.71 29.83L8.2 31.5L8.54 32.17L8.54 34.02L8.2 34.35L7.53 34.35L7.53 34.86L8.03 35.02L7.87 38.21L6.69 38.38L6.69 39.88L6.36 40.05L6.36 45.58L5.86 47.26L5.86 56.48L5.52 57.82L5.35 61.84L6.02 65.87L7.87 66.03L7.87 68.38L6.19 74.42L6.19 75.09L7.03 76.6L7.53 78.44L7.53 80.28L6.69 81.46L6.69 82.13L7.03 82.97L7.7 83.47L7.7 85.14L2 85.82L5.86 85.48L16.92 85.31L12.73 85.14L12.73 82.97L12.23 80.79L11.05 78.1L11.05 75.42L11.55 73.58L11.55 71.4L12.23 67.54L12.73 66.37L15.24 66.03L15.41 60.17L15.91 59.5L17.92 59.66L18.6 64.19L20.1 70.06L20.44 75.25L20.94 76.6L22.28 77.43L23.12 78.61L23.29 81.96L23.79 82.46L24.63 82.63L28.32 82.46L29.32 81.96L29.32 81.12L28.15 78.77L25.47 75.92L24.29 72.4L23.12 66.71L22.79 61.68L24.29 55.31L27.82 46.09L30.5 41.9L33.18 39.05L35.86 39.05L37.71 39.55L46.76 43.07L50.95 44.24L53.13 44.58L56.98 44.58L58.66 44.24L67.04 44.41L67.38 44.75L67.38 46.59L66.54 50.11L65.7 57.32L65.03 58.99L65.03 62.68L63.86 68.05L62.35 72.74L62.35 73.91L63.86 76.09L63.86 78.1L63.35 78.77L63.52 80.12L64.19 80.95L65.53 81.29L69.05 81.29L69.55 80.95L69.05 79.11L67.21 76.6L66.37 74.58L66.37 70.39L66.71 70.23L66.71 68.72L67.88 64.86L69.89 61.01L71.4 54.3L73.24 54.13L73.58 55.98L73.41 62.01L73.91 62.85L74.25 64.53L74.25 75.25L74.58 75.92L77.43 78.44L77.43 80.45L78.27 81.62L78.94 81.96L83.3 81.96L83.8 81.62L83.8 80.62L82.97 79.45L79.61 76.26L78.77 74.75L77.94 70.9L77.94 65.03L78.44 63.52L78.44 61.34L78.77 60.67L78.77 55.81L80.79 46.92L81.12 43.91L84.31 41.06L86.15 38.21L87.32 34.18L87.99 28.99L91.51 24.29L95.54 19.77L97.05 18.6L99.39 18.43L100.06 18.93L100.57 20.61L102.24 22.79L102.41 25.47L102.91 26.81L103.08 30.5L104.09 31.17L104.59 32.17L105.43 32.17L106.77 33.18L109.62 32.17L110.46 30.83L110.46 29.49L110.79 28.99L110.79 27.48L111.63 24.63L111.63 23.29L111.97 22.95L111.97 21.61L112.3 21.45L112.3 20.27L113.14 18.09L113.14 15.75L113.47 15.58L113.98 11.05L115.82 10.72L118 9.21L117.16 8.37L115.82 8.71L112.97 8.71L112.3 7.87L110.12 6.53L109.79 6.02L103.58 3.34L98.22 2.17L95.2 2.17Z";

/* Mane and forelock: separate paths so the silhouette stays one closed shape. */
const HORSE_PARTS = ["M95.03 2L90.51 2.17L83.64 4.01L78.61 6.36L72.24 9.88L71.73 9.88L71.57 10.21L66.03 11.72L61.68 14.07L57.32 15.58L57.77 16.87L62.33 15.53L67.14 14.57L73.2 15.25L74.13 14.75L75.34 15.93L81.14 11.28L85.48 9.23L91.09 5.47L95.09 3.6Z","M94.03 2.5 C98.53 1.5 101.03 4.5 100.53 8 C99.43 6 98.03 4.6 94.03 4.6 Z"];

/* Centre and radius of each zone, measured off the traced outline rather than
   judged by eye: the limb zones sit on the scanline band where that segment
   actually is — the hoof where the column flares out to the ground, the pastern
   on the short forward-sloping run above it, the cannon on the constant-width
   run, the knee and hock on the wide band above that. Croup and haunch come
   from the topline profile: the croup plateaus at y≈13 across x 26..38, and the
   haunch runs from the point of buttock at x≈9 forward to the stifle at x≈26. */
const BODY_ZONES = {"fore foot":[80.3,80,3.4],"fore pastern":[78.2,77,2.8],"fore cannon":[76.1,68.5,4.4],"knee":[76.2,58.5,4.2],"shoulder":[72,32,8],"hind foot":[26,80.3,3.4],"hind pastern":[24.3,77.3,2.8],"hind cannon":[21.8,70,4.2],"hock":[20.6,60,4.2],"stifle":[25,45,5],"hip":[20,29,7.5],"sacroiliac":[31,17,5.5],"back":[48,21,8],"neck":[80,13,8]};

/**
 * Body map: where each candidate diagnosis sits, shaded by how likely it is.
 *
 * A side view cannot show left from right, and pretending otherwise would be
 * worse than not showing it — so laterality is left to the limb chart and this
 * answers only "whereabouts in the horse". Zones come from a fixed list the
 * model picks from, rather than being guessed out of free text, so a blob
 * cannot land on the wrong leg.
 */
const ZONE_ALIASES = { 'whole horse': null, 'not localized': null };

/** Dark red at high confidence through to pink at low. */
function likelihoodColor(rating) {
  const t = Math.max(0, Math.min(1, (Number(rating) || 0) / 100));
  const high = [140, 29, 19];
  const low = [242, 184, 198];
  const mix = high.map((h, i) => Math.round(low[i] + (h - low[i]) * t));
  return `rgb(${mix.join(' ')})`;
}

function renderBodyMap(differential) {
  const placed = (differential ?? [])
    .filter((d) => d.bodyZone && !(d.bodyZone in ZONE_ALIASES) && BODY_ZONES[d.bodyZone])
    .slice()
    // Least likely first so the strongest candidate ends up on top.
    .sort((a, b) => (a.likelihoodRating ?? 0) - (b.likelihoodRating ?? 0));
  const systemic = (differential ?? []).filter((d) => d.bodyZone === 'whole horse');

  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const box = el('div', 'bodymap');
  const svg = make('svg', { viewBox: HORSE_VIEWBOX, class: 'bodymap-svg', role: 'img' });
  svg.setAttribute('aria-label', placed.length
    ? `Body diagram: ${placed.map((d) => d.bodyZone).join(', ')} highlighted`
    : 'Body diagram with no region highlighted');

  const defs = make('defs', {});
  const clip = make('clipPath', { id: 'bodymap-clip' });
  for (const d of [HORSE_BODY, ...HORSE_PARTS]) clip.append(make('path', { d }));
  defs.append(clip);

  placed.forEach((dx, i) => {
    const grad = make('radialGradient', { id: `bmg${i}` });
    const c = likelihoodColor(dx.likelihoodRating);
    grad.append(make('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': '0.95' }));
    grad.append(make('stop', { offset: '55%', 'stop-color': c, 'stop-opacity': '0.55' }));
    grad.append(make('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': '0' }));
    defs.append(grad);
  });
  svg.append(defs);

  // The blank horse, always drawn, so the shape reads even with nothing marked.
  const silhouette = make('g', { class: 'bodymap-hide' });
  for (const d of [HORSE_BODY, ...HORSE_PARTS]) silhouette.append(make('path', { d }));
  svg.append(silhouette);

  // Systemic candidates tint the whole animal rather than one spot.
  for (const dx of systemic) {
    const tint = make('g', {
      class: 'bodymap-systemic',
      fill: likelihoodColor(dx.likelihoodRating),
      opacity: '0.3',
    });
    for (const d of [HORSE_BODY, ...HORSE_PARTS]) tint.append(make('path', { d }));
    svg.append(tint);
  }

  const marks = make('g', { 'clip-path': 'url(#bodymap-clip)' });
  placed.forEach((dx, i) => {
    const [x, y, r] = BODY_ZONES[dx.bodyZone];
    marks.append(make('circle', { cx: x, cy: y, r: r * 1.9, fill: `url(#bmg${i})` }));
  });
  svg.append(marks);

  // A ring on the leading candidate, so the eye lands on it first.
  const top = placed[placed.length - 1];
  if (top) {
    const [x, y, r] = BODY_ZONES[top.bodyZone];
    svg.append(make('circle', {
      cx: x, cy: y, r: r * 1.15, class: 'bodymap-ring',
      stroke: likelihoodColor(top.likelihoodRating),
    }));
  }
  box.append(svg);

  const legend = el('div', 'bodymap-legend');
  legend.append(el('span', null, 'least likely'));
  legend.append(el('span', 'bodymap-ramp'));
  legend.append(el('span', null, 'most likely'));
  box.append(legend);

  const keyed = [...placed, ...systemic].sort(
    (a, b) => (b.likelihoodRating ?? 0) - (a.likelihoodRating ?? 0),
  );
  if (keyed.length) {
    const ul = el('ul', 'bodymap-key');
    for (const dx of keyed) {
      const li = el('li');
      const dot = el('span', 'bodymap-dot');
      dot.style.background = likelihoodColor(dx.likelihoodRating);
      li.append(dot, el('span', 'bodymap-zone', dx.bodyZone), el('span', 'bodymap-cond', dx.condition),
        el('span', 'bodymap-pct', `${dx.likelihoodRating}%`));
      ul.append(li);
    }
    box.append(ul);
  }

  const unplaced = (differential ?? []).filter((d) => d.bodyZone === 'not localized');
  const note = keyed.length
    ? 'Where each candidate sits, shaded by the model’s confidence. A side view cannot show left from right — the limb chart below does that.'
    : 'Nothing in the differential could be pinned to a region of the body.';
  box.append(el('p', 'bodymap-note', unplaced.length
    ? `${note} Not shown, because ${unplaced.length === 1 ? 'it is not' : 'they are not'} tied to one place: ${unplaced.map((d) => d.condition).join('; ')}.`
    : note));
  return box;
}

/**
 * Limb loading chart.
 *
 * This is the model's eyeball estimate from still frames, not a measurement —
 * there is no force plate and no contact timing here. So the chart shows what
 * was actually judged, marks limbs the supplied views could not show rather
 * than drawing them as normal, and states in one line what it is.
 */
const LIMB_ORDER = ['left fore', 'right fore', 'left hind', 'right hind'];

/** Which limbs the assessment actually implicated, expanded from its shorthand. */
function flaggedLimbs(affectedLimbs) {
  const out = new Set();
  for (const entry of affectedLimbs ?? []) {
    const l = String(entry.limb ?? '').toLowerCase();
    if (l === 'both fore') { out.add('left fore'); out.add('right fore'); }
    else if (l === 'both hind') { out.add('left hind'); out.add('right hind'); }
    else if (LIMB_ORDER.includes(l)) out.add(l);
    // "multiple limbs" and "undetermined" name nothing, so they highlight nothing.
  }
  return out;
}

function renderLimbChart(limbLoading, affectedLimbs) {
  const rows = LIMB_ORDER
    .map((name) => (limbLoading ?? []).find((e) => String(e.limb).toLowerCase() === name))
    .filter(Boolean);
  if (rows.length < 4) return null;

  const flagged = flaggedLimbs(affectedLimbs);
  const box = el('div', 'limb-chart');
  box.append(el('p', 'card-sub', 'How normally each limb appears to load — the model\'s estimate by eye from still frames, not a measurement. A sound horse sits near 100 on all four; gaps under about 10 points are noise.'));

  for (const [pair, label] of [['fore', 'Forelimbs'], ['hind', 'Hind limbs']]) {
    const inPair = rows.filter((r) => r.limb.endsWith(pair));
    const head = el('div', 'limb-pair-head');
    head.append(el('span', 'limb-pair-name', label));

    // The clinical signal is the left-right difference, so state it when both
    // sides could actually be judged.
    const [a, b] = inPair;
    if (a?.assessable && b?.assessable) {
      const gap = Math.abs(a.loading - b.loading);
      head.append(el('span', `limb-gap${gap >= 10 ? ' notable' : ''}`,
        gap >= 10 ? `${gap} point difference` : 'even'));
    } else {
      head.append(el('span', 'limb-gap muted', 'not comparable'));
    }
    box.append(head);

    for (const r of inPair) {
      const row = el('div', `limb-row${flagged.has(r.limb) ? ' flagged' : ''}${r.assessable ? '' : ' unknown'}`);
      row.append(el('span', 'limb-label', r.limb));

      const track = el('div', 'limb-track');
      if (r.assessable) {
        const fill = el('span', 'limb-fill');
        fill.style.width = `${Math.max(0, Math.min(100, r.loading))}%`;
        track.append(fill);
      }
      row.append(track);
      row.append(el('span', 'limb-value', r.assessable ? String(r.loading) : 'not assessable'));
      if (r.note) row.append(el('p', 'limb-note', r.note));
      box.append(row);
    }
  }
  return box;
}

function renderGait(g) {
  const box = el('div');

  const row = el('div', 'grade-row');
  row.append(
    el(
      'span',
      'grade-badge',
      g.aaepGrade === 'indeterminate' ? 'Grade: unclear' : `AAEP Grade ${g.aaepGrade}`,
    ),
  );
  if (g.gaitsObserved?.length) {
    row.append(el('span', 'grade-scale', `Observed at: ${g.gaitsObserved.join(', ')}`));
  }
  box.append(row);
  box.append(el('p', null, g.aaepGradeRationale));

  const chart = renderLimbChart(g.limbLoading, g.affectedLimbs);
  if (chart) box.append(chart);

  if (g.affectedLimbs?.length) {
    box.append(el('h5', null, 'Limbs implicated'));
    const ul = el('ul', 'limb-list');
    for (const limb of g.affectedLimbs) {
      const li = el('li');
      const name = el('span', 'limb-name', limb.limb);
      const conf = el('span', `conf ${limb.confidence}`, `${limb.confidence} confidence`);
      li.append(name, conf, el('p', 'limb-evidence', limb.evidence));
      ul.append(li);
    }
    box.append(ul);
  }

  if (g.keyObservations?.length) {
    box.append(el('h5', null, 'Key observations'), list(g.keyObservations, 'obs-list'));
  }
  if (g.compensatoryPattern && !/^none/i.test(g.compensatoryPattern)) {
    box.append(el('h5', null, 'Compensation'), el('p', null, g.compensatoryPattern));
  }
  return box;
}

function renderDifferential(differential) {
  const box = el('div');
  box.append(
    el(
      'p',
      'card-sub',
      'Ordered from most likely and most common down to least likely. Percentages are the model\'s rough confidence, not a clinical probability.',
    ),
  );

  for (const dx of differential ?? []) {
    const card = el('div', 'dx');
    // Drives the severity stripe and rank-chip emphasis in CSS, so likelihood
    // reads as form and not only as a percentage.
    card.dataset.likelihood = dx.likelihood;

    const head = el('div', 'dx-head');
    head.append(el('div', 'dx-rank', String(dx.rank)));

    const title = el('div', 'dx-title');
    title.append(el('h4', null, dx.condition));
    title.append(el('p', 'dx-region', `${dx.region} · ${dx.likelihood}`));
    head.append(title);

    const like = el('div', 'dx-like');
    like.append(el('div', 'dx-like-label', 'Confidence'));
    like.append(el('div', 'dx-like-val', `${dx.likelihoodRating}%`));
    head.append(like);
    card.append(head);

    const bar = el('div', 'bar');
    const fill = el('span');
    fill.style.width = `${Math.max(0, Math.min(100, dx.likelihoodRating))}%`;
    bar.append(fill);
    card.append(bar);

    card.append(el('p', 'dx-rationale', dx.rationale));

    const evidence = el('div', 'evidence');
    const forCol = el('div');
    forCol.append(el('h5', null, 'Points toward it'), list(dx.supportingEvidence));
    const againstCol = el('div');
    againstCol.append(el('h5', null, 'Points away / unassessable'), list(dx.againstEvidence));
    evidence.append(forCol, againstCol);
    card.append(evidence);

    const more = el('details', 'dx-more');
    more.append(el('summary', null, 'Confirmatory tests and treatment plan'));

    const body = el('div', 'remedy');
    body.append(el('h5', null, 'How a vet would confirm this'), list(dx.confirmatoryTests));

    const r = dx.remedies;
    body.append(el('h5', null, 'What to do right now'), el('p', null, r.immediate));
    body.append(el('h5', null, 'Veterinary options to discuss'), el('p', null, r.veterinary));
    body.append(el('h5', null, 'Trimming and shoeing'), el('p', null, r.farriery));
    body.append(el('h5', null, 'Rehab and conditioning'), list(r.rehabAndConditioning));

    const dl = el('dl');
    for (const [term, value] of [
      ['Timeline', r.expectedTimeline],
      ['Prognosis', r.prognosis],
    ]) {
      const pair = el('div', 'kv');
      pair.append(el('dt', null, `${term}:`), el('dd', null, value));
      dl.append(pair);
    }
    body.append(dl);

    more.append(body);
    card.append(more);
    box.append(card);
  }
  return box;
}

function renderPlan(plan) {
  const box = el('div');
  box.append(el('p', 'card-sub', 'Start this only once your vet has diagnosed the problem and cleared the horse to work.'));
  box.append(el('p', null, plan.goal));

  for (const phase of plan.phases ?? []) {
    const block = el('div', 'phase');
    const head = el('div', 'phase-head');
    head.append(el('h4', null, phase.name), el('span', 'phase-dur', phase.duration));
    block.append(head);
    block.append(el('p', 'phase-focus', phase.focus));
    block.append(list(phase.sessions));
    block.append(el('p', 'gate', `Move on when: ${phase.progressionCriteria}`));
    box.append(block);
  }

  if (plan.farrierPriorities?.length) {
    box.append(el('h5', null, 'Farrier priorities'), list(plan.farrierPriorities, 'obs-list'));
  }
  if (plan.monitoring?.length) {
    box.append(el('h5', null, 'What to watch, and when to stop'), list(plan.monitoring, 'obs-list'));
  }
  return box;
}

// ----------------------------------------------------------------- controls

$('#restart').addEventListener('click', () => {
  clearAll();
  show('upload');
});
$('#retry').addEventListener('click', () => show('upload'));
$('#print').addEventListener('click', () => window.print());
