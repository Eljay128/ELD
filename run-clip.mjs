import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { extractFrames } from './src/frames.js';
import { analyzeCase } from './src/analyze.js';

const file = process.argv[2];
const view = process.argv[3] ?? 'side';
const out = process.argv[4] ?? './clip-report.json';

const intake = { gait: 'Trot', notes: 'Owner-supplied clip, single view.' };

const clip = await extractFrames(file, 18, 3, { gait: intake.gait });
console.log(`frames: ${clip.frames.length} in ${clip.sampling.bursts} bursts, ${clip.meta.width}x${clip.meta.height}, ${clip.meta.duration.toFixed(1)}s`);

const result = await analyzeCase({
  clips: [{ view, meta: clip.meta, frames: clip.frames, sampling: clip.sampling }],
  intake,
  onProgress: (m) => console.log(`  ${new Date().toISOString().slice(11, 19)}  ${m}`),
});

writeFileSync(out, JSON.stringify(result, null, 2));

const r = result.report;
console.log('\n--- RESULT ---');
console.log('emergency:', r.emergency.isEmergency);
console.log('footage:', r.videoQuality.rating);
console.log('AAEP grade:', r.gaitAssessment.aaepGrade, '—', r.gaitAssessment.aaepGradeRationale);
console.log('limbs:', (r.gaitAssessment.affectedLimbs ?? []).map((l) => `${l.limb} (${l.confidence})`).join(', ') || 'none');
console.log('\ndifferential:');
for (const d of r.differential) console.log(`  ${d.rank}. ${d.condition} — ${d.likelihoodRating}% (${d.likelihood})`);
console.log(`\nsources: ${result.sources.length}, tokens: ${result.meta.tokensUsed}`);
