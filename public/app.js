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
    `${meta.frameCount} frames analysed`,
    `${meta.videoDuration.toFixed(1)}s of footage`,
    meta.webResearch ? 'Web research: on' : 'Web research: off',
    new Date(meta.generatedAt).toLocaleString(),
  ]) {
    strip.append(el('li', null, item));
  }
  root.append(strip);

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
