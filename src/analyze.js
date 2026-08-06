import Anthropic from '@anthropic-ai/sdk';
import { buildKnowledgePrompt } from './knowledge.js';
import { REPORT_SCHEMA } from './schema.js';

const MODEL = 'claude-opus-5';

const client = new Anthropic();

/**
 * The analysis runs in two passes.
 *
 * Pass 1 looks at the frames and, with the web-search tool enabled, compares what
 * it sees against current published case descriptions. Letting it search here is
 * the point of the exercise — the differential is anchored to how these
 * presentations are actually reported, not only to the built-in library.
 *
 * Pass 2 turns those findings into strict JSON. Splitting the passes keeps the
 * schema reliable: a single call juggling server-side tool use and a rigid output
 * format is far more likely to come back malformed or truncated.
 */

function describeHorse(intake) {
  const fields = [
    ['Name', intake.horseName],
    ['Age', intake.age],
    ['Breed / type', intake.breed],
    ['Sex', intake.sex],
    ['Discipline / job', intake.discipline],
    ['Gait(s) in the video', intake.gait],
    ['Surface / footing', intake.surface],
    ['Viewing angle', intake.viewAngle],
    ['Shod or barefoot', intake.shoeing],
    ['Weeks since last farrier visit', intake.farrierWeeks],
    ['When the problem was first noticed', intake.onset],
    ['Onset', intake.onsetType],
    ['Getting better, worse or unchanged', intake.trajectory],
    ['Worse on hard or soft footing', intake.surfaceEffect],
    ['Warms out of it or worsens with work', intake.warmupEffect],
    ['Known previous injuries or diagnoses', intake.history],
    ['Current medications or supplements', intake.medications],
    ['Other observations from the owner', intake.notes],
  ];

  const filled = fields
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([label, value]) => `- ${label}: ${String(value).trim()}`);

  return filled.length ? filled.join('\n') : '- (No background information supplied by the owner.)';
}

export const VIEW_PURPOSE = {
  front: 'FRONT view (horse trotting TOWARD the camera) — this is where the HEAD NOD is read, and where medio-lateral limb deviation (winging, paddling, plaiting) is visible.',
  rear: 'REAR view (horse moving AWAY from the camera) — this is where the HIP HIKE / sacral rise is read, and where hindlimb tracking and base width are visible.',
  side: 'SIDE view (lateral pass) — this is where stride length, overtrack, cranial vs caudal phase, foot flight arc, landing pattern, hoof-pastern axis and WITHERS movement are visible. Withers movement is the sign that separates a true forelimb lameness from a hindlimb-induced false nod.',
};

/** Frames from every clip, grouped and labelled by camera view. */
function clipContent(clips) {
  const blocks = [];
  for (const clip of clips) {
    blocks.push({
      type: 'text',
      text:
        `\n===== ${clip.view.toUpperCase()} VIEW — ${clip.frames.length} frames from ` +
        `${clip.meta.duration.toFixed(1)}s at ${clip.meta.width}x${clip.meta.height} =====\n` +
        `${VIEW_PURPOSE[clip.view] ?? ''}\n` +
        describeSampling(clip.sampling, clip.frames),
    });
    for (const frame of clip.frames) {
      blocks.push({ type: 'text', text: `[${clip.view}] frame ${frame.index + 1}/${clip.frames.length} — ${frame.label}` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame.base64 } });
    }
  }
  return blocks;
}

export const OBSERVER_SYSTEM = `
You are assisting a veterinary lameness workup by analysing still frames sampled from video of a
horse in motion. The frames arrive in dense bursts — see the sampling note in the user message,
which tells you exactly which frames are consecutive stride phases and which are seconds apart.

You may be given up to THREE separate clips of the same horse in the same session, each from a
different camera view, clearly labelled. Each view answers different questions and they are not
interchangeable:

  FRONT (toward the camera) — the HEAD NOD lives here. Also medio-lateral limb deviation.
  REAR  (away from the camera) — the HIP HIKE / sacral rise lives here. Also hindlimb tracking.
  SIDE  (lateral pass) — stride length, overtrack, cranial vs caudal phase, foot flight arc,
        landing pattern, hoof-pastern axis, and WITHERS movement.

Use them together. The single most valuable cross-view inference available to you: WITHERS movement
from the SIDE view distinguishes a genuine forelimb lameness from a hindlimb-induced false head nod
seen from the FRONT. In true forelimb lameness the withers asymmetry tracks with the head nod; in
hindlimb-induced compensation it shifts toward the opposite side. If you have both views, make that
call explicitly. If a view is missing, say what it would have resolved.

Compare findings across views and state whether they agree. Two views independently implicating the
same limb is far stronger evidence than one view alone; two views disagreeing is itself a finding
and usually means the asymmetry is below the reliable detection threshold.

Your job in this pass is OBSERVATION and RESEARCH, not a final report.

Work in this order:

1. Describe what is physically visible, frame by frame where it matters. Track across the
   sequence: head and neck vertical excursion and which forelimb is grounded at each extreme;
   pelvic and tuber coxae symmetry; stride length and overtrack; cranial versus caudal phase of
   stride; foot flight arc; landing pattern (toe-first, flat, heel-first); hoof-pastern axis;
   hoof length and heel height; muscle symmetry over shoulder, gluteals and topline; head carriage,
   back posture and tail position; any swelling, effusion, wound or postural abnormality.

2. Apply the laterality rules explicitly. State the rule, then the observation, then the
   conclusion. If the frames genuinely do not support a laterality call, say so plainly rather
   than guessing — an unsupported limb call is worse than no limb call.

3. Explicitly consider whether any asymmetry is compensatory rather than a second primary problem,
   and whether a symmetric bilateral problem could be hiding behind an apparently even gait.

4. Assess how good this footage actually is for the purpose, and what a better clip would show.

5. Then use web search to check your reading against current published sources. Search for the
   specific presentation you observed — the gait pattern combined with the signalment and history —
   and for how confirmed cases of your leading candidates are described. Look for how practitioners
   distinguish between the candidates you are weighing, and for anything that would reorder them.
   Run several focused searches rather than one broad one, and prefer veterinary-school, journal,
   and established clinical sources. Note briefly where a source changed your thinking.

Be rigorous about uncertainty. Still frames sampled from video cannot show you palpation, heat,
digital pulse, hoof-tester response, flexion tests or nerve blocks, and visual assessment misses
asymmetry below roughly 25%. Say what you cannot see.

Reason from prevalence: common conditions are common. A middle-aged sport horse with a short
choppy hind gait is far more likely to have distal hock arthritis than a rare neoplasm.
`.trim();

export const REPORT_SYSTEM = `
You are producing an owner-facing lameness screening report from a completed observation and
research pass. Return only the structured report in the required schema.

Rules:

- Rank the differential from MOST LIKELY AND COMMON to least likely. Prevalence in the general
  horse population, weighted by this horse's signalment and history, is the primary ordering
  criterion; specific visual evidence moves a condition up or down from there. Include between
  three and seven candidates. Always include at least one "unlikely but important to exclude"
  entry when a serious condition is plausible.
- Every ranked condition must carry both supporting AND contradicting evidence. If the footage
  cannot assess something relevant, that belongs in againstEvidence.
- Remedies must be specific and actionable — actual exercises, actual shoeing changes, actual
  timelines. Frame veterinary treatments as options to discuss with a vet, never as instructions
  the owner should carry out alone. Never suggest a prescription medication, dose, or a
  joint injection the owner would administer themselves.
- If the emergency red flags are met, set isEmergency true, and make the immediate remedy for the
  top-ranked condition "contact your veterinarian today" rather than anything the owner should try.
- The stride optimisation plan must be explicitly conditional on veterinary clearance, and phased
  with objective criteria for moving between phases.
- Write for a competent horse owner: plain language, no hedging into uselessness, technical terms
  explained the first time they appear.
- Be honest in limitations. This is a screening aid built on still frames, not a diagnosis.
- Fill viewsAnalyzed with one entry per view supplied, saying what each established. Add an entry
  with view "not supplied" for each of front/rear/side that is missing, saying what could not be
  assessed without it. Do not pad: if all three were supplied and usable, say so plainly.
`.trim();

/** Explains the burst structure so the model knows which frames it may compare directly. */
function describeSampling(sampling, frames) {
  if (!sampling) return '';
  const { bursts, perBurst, innerStep } = sampling;
  return [
    `The ${frames.length} frames are NOT evenly spread across the clip. They were captured as`,
    `${bursts} dense burst${bursts === 1 ? '' : 's'} of ${perBurst} frames, with only ${innerStep.toFixed(2)}s`,
    `between consecutive frames inside a burst — deliberately fast enough to resolve a single stride`,
    `cycle (a trot cycle is roughly 0.6-0.85s). Frames within the same burst ARE consecutive stride`,
    `phases and can be compared directly to track head height against which limb is grounded.`,
    `Frames in different bursts are seconds apart and must NOT be treated as consecutive.`,
    `Each frame is labelled with its burst number and timestamp.`,
  ].join(' ');
}

/** Run the observation pass, resuming automatically if a server-tool turn pauses. */
async function observationPass({ clips, intake, webResearch, onProgress }) {
  const tools = webResearch
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }]
    : [];

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            'Analyse this horse for signs of lameness or gait abnormality.',
            '',
            clips.length === 1
              ? 'ONE camera view was supplied.'
              : `${clips.length} camera views of the SAME horse in the same session were supplied: ` +
                `${clips.map((c) => c.view).join(', ')}. Each is labelled below.`,
            '',
            'Owner-supplied background:',
            describeHorse(intake),
          ].filter(Boolean).join('\n'),
        },
        ...clipContent(clips),
        {
          type: 'text',
          text:
            'Work through the five steps in order. Where more than one view was supplied, compare them ' +
            'explicitly and state whether they agree. Finish with a short ranked shortlist of candidate ' +
            'diagnoses and the reasoning behind that ordering — the next pass will turn it into the report.',
        },
      ],
    },
  ];

  let response;
  for (let attempt = 0; attempt < 6; attempt++) {
    onProgress?.(
      attempt === 0
        ? 'Examining gait across the sampled frames…'
        : 'Cross-referencing published case descriptions…',
    );

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system: [{ type: 'text', text: `${OBSERVER_SYSTEM}\n\n${buildKnowledgePrompt()}`, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high' },
      ...(tools.length ? { tools } : {}),
      messages,
    });
    response = await stream.finalMessage();

    if (response.stop_reason !== 'pause_turn') break;
    // A server-side tool loop hit its iteration cap; append and re-send to resume.
    messages.push({ role: 'assistant', content: response.content });
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to analyse this footage. Please try a different video.');
  }

  const findings = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
    .trim();

  const sources = [];
  for (const block of response.content) {
    if (block.type !== 'web_search_tool_result') continue;
    // On error, `content` is a single object rather than a list of results.
    if (!Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (result.url && !sources.some((s) => s.url === result.url)) {
        sources.push({ url: result.url, title: result.title ?? result.url });
      }
    }
  }

  return { findings, sources, usage: response.usage };
}

/** Turn the observation narrative into the strict report schema. */
async function reportPass({ findings, intake, clips, onProgress }) {
  onProgress?.('Building the ranked differential and treatment plan…');

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: [{ type: 'text', text: `${REPORT_SYSTEM}\n\n${buildKnowledgePrompt()}`, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema: REPORT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          `Views supplied: ${clips.map((c) => `${c.view} (${c.meta.duration.toFixed(1)}s, ${c.frames.length} frames)`).join('; ')}.`,
          '',
          'Owner-supplied background:',
          describeHorse(intake),
          '',
          '--- OBSERVATION AND RESEARCH PASS ---',
          findings,
          '--- END ---',
          '',
          'Produce the structured screening report.',
        ].join('\n'),
      },
    ],
  });

  const response = await stream.finalMessage();

  if (response.stop_reason === 'max_tokens') {
    throw new Error('The report was cut off before it finished. Please try again.');
  }

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('The model returned an empty report.');

  try {
    return { report: JSON.parse(text), usage: response.usage };
  } catch (err) {
    throw new Error('The report came back in an unreadable format. Please try again.', { cause: err });
  }
}

/**
 * Analyse one case. `clips` is 1-3 entries of {view, meta, frames, sampling} —
 * front, rear and side views of the same horse in the same session.
 */
export async function analyzeCase({ clips, intake, webResearch = true, onProgress }) {
  const observation = await observationPass({ clips, intake, webResearch, onProgress });

  if (observation.sources.length) {
    onProgress?.(`Cross-referenced ${observation.sources.length} published sources.`);
  }

  const { report, usage } = await reportPass({
    findings: observation.findings,
    intake,
    clips,
    onProgress,
  });

  const totalTokens = (u) => (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0);

  return {
    report,
    observation: observation.findings,
    sources: observation.sources,
    meta: {
      model: MODEL,
      views: clips.map((c) => c.view),
      frameCount: clips.reduce((n, c) => n + c.frames.length, 0),
      videoDuration: clips.reduce((d, c) => d + c.meta.duration, 0),
      webResearch,
      tokensUsed: totalTokens(observation.usage) + totalTokens(usage),
      generatedAt: new Date().toISOString(),
    },
  };
}
