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

function renderReport({ report, observation, sources, meta }) {
  const root = $('#report');
  root.replaceChildren();

  // Emergency banner first — it is the only thing that matters if it fires.
  if (report.emergency?.isEmergency) {
    const box = el('div', 'notice notice-danger');
    box.append(el('strong', null, 'Call your veterinarian today.'));
    box.append(
      el('p', null, 'This footage or history shows at least one sign that should not wait:'),
      list(report.emergency.reasons),
    );
    root.append(box);
  }

  // Header + run metadata
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

  if (report.viewsAnalyzed?.length) root.append(renderViews(report.viewsAnalyzed));
  root.append(renderVideoQuality(report.videoQuality));
  root.append(renderGait(report.gaitAssessment));
  root.append(renderDifferential(report.differential));
  root.append(renderPlan(report.strideOptimizationPlan));

  if (report.vetVisitChecklist?.length) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Take this to your vet'));
    card.append(list(report.vetVisitChecklist, 'obs-list'));
    root.append(card);
  }

  if (report.limitations?.length) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'What this cannot tell you'));
    card.append(list(report.limitations, 'obs-list'));
    root.append(card);
  }

  if (sources?.length) {
    const card = el('div', 'card');
    card.append(el('h2', null, 'Sources consulted'));
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
    card.append(ul);
    root.append(card);
  }

  if (observation) {
    const card = el('div', 'card raw');
    const details = el('details');
    details.append(el('summary', null, 'Full frame-by-frame working notes'));
    details.append(el('pre', null, observation));
    card.append(details);
    root.append(card);
  }

  show('report');
}

function renderViews(views) {
  const card = el('div', 'card');
  card.append(el('h2', null, 'What each view contributed'));
  const ul = el('ul', 'limb-list');
  for (const v of views) {
    const li = el('li');
    const missing = v.view === 'not supplied' || !v.usable;
    li.append(el('span', 'limb-name', v.view));
    li.append(el('span', `conf ${missing ? 'low' : 'high'}`, missing ? 'not usable' : 'used'));
    li.append(el('p', 'limb-evidence', v.contributed));
    ul.append(li);
  }
  card.append(ul);
  return card;
}

function renderVideoQuality(q) {
  const card = el('div', 'card');
  card.append(el('h2', null, 'Footage quality'));

  const rating = el('p');
  rating.append(el('strong', null, `${q.rating.charAt(0).toUpperCase()}${q.rating.slice(1)}`));
  rating.append(
    document.createTextNode(
      q.rating === 'good'
        ? ' — this clip supports a reasonable assessment.'
        : ' — read the findings below with that in mind.',
    ),
  );
  card.append(rating);

  if (q.issues?.length) {
    card.append(el('h5', null, 'Limitations of this clip'), list(q.issues, 'obs-list'));
  }
  if (q.suggestions?.length) {
    card.append(el('h5', null, 'For a better clip next time'), list(q.suggestions, 'obs-list'));
  }
  return card;
}

function renderGait(g) {
  const card = el('div', 'card');
  card.append(el('h2', null, 'What the gait shows'));

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
  card.append(row);
  card.append(el('p', null, g.aaepGradeRationale));

  if (g.affectedLimbs?.length) {
    card.append(el('h5', null, 'Limbs implicated'));
    const ul = el('ul', 'limb-list');
    for (const limb of g.affectedLimbs) {
      const li = el('li');
      const name = el('span', 'limb-name', limb.limb);
      const conf = el('span', `conf ${limb.confidence}`, `${limb.confidence} confidence`);
      li.append(name, conf, el('p', 'limb-evidence', limb.evidence));
      ul.append(li);
    }
    card.append(ul);
  }

  if (g.keyObservations?.length) {
    card.append(el('h5', null, 'Key observations'), list(g.keyObservations, 'obs-list'));
  }
  if (g.compensatoryPattern && !/^none/i.test(g.compensatoryPattern)) {
    card.append(el('h5', null, 'Compensation'), el('p', null, g.compensatoryPattern));
  }
  return card;
}

function renderDifferential(differential) {
  const section = el('div');
  const intro = el('div', 'report-head');
  intro.append(el('h2', null, 'Possible diagnoses'));
  intro.append(
    el(
      'p',
      'card-sub',
      'Ordered from most likely and most common down to least likely. Percentages are the model\'s rough confidence, not a clinical probability.',
    ),
  );
  section.append(intro);

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
    section.append(card);
  }
  return section;
}

function renderPlan(plan) {
  const card = el('div', 'card');
  card.append(el('h2', null, 'Getting back to a full stride'));
  card.append(el('p', 'card-sub', 'Start this only once your vet has diagnosed the problem and cleared the horse to work.'));
  card.append(el('p', null, plan.goal));

  for (const phase of plan.phases ?? []) {
    const block = el('div', 'phase');
    const head = el('div', 'phase-head');
    head.append(el('h4', null, phase.name), el('span', 'phase-dur', phase.duration));
    block.append(head);
    block.append(el('p', 'phase-focus', phase.focus));
    block.append(list(phase.sessions));
    block.append(el('p', 'gate', `Move on when: ${phase.progressionCriteria}`));
    card.append(block);
  }

  if (plan.farrierPriorities?.length) {
    card.append(el('h5', null, 'Farrier priorities'), list(plan.farrierPriorities, 'obs-list'));
  }
  if (plan.monitoring?.length) {
    card.append(el('h5', null, 'What to watch, and when to stop'), list(plan.monitoring, 'obs-list'));
  }
  return card;
}

// ----------------------------------------------------------------- controls

$('#restart').addEventListener('click', () => {
  clearAll();
  show('upload');
});
$('#retry').addEventListener('click', () => show('upload'));
$('#print').addEventListener('click', () => window.print());
