/**
 * Preflight check: `npm run doctor`
 *
 * Verifies everything the app needs before you upload a real video, so a bad key
 * or a missing codec surfaces here rather than as a failed job three minutes in.
 *
 * Optionally pass a video path to also exercise frame extraction on real footage:
 *   npm run doctor -- ./my-horse-clip.mp4
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import Anthropic from '@anthropic-ai/sdk';
import { extractFrames } from './frames.js';
import { buildKnowledgePrompt, CONDITIONS } from './knowledge.js';
import { ASSESSMENT_SCHEMA, PLAN_SCHEMA, REPORT_SCHEMA } from './schema.js';

const execFileAsync = promisify(execFile);

const PASS = '[32m✓[0m';
const FAIL = '[31m✗[0m';
const WARN = '[33m![0m';

let failed = false;

/** Returns true on success, so a later check can skip when its prerequisite failed. */
async function check(label, fn) {
  let ok = true;
  try {
    const detail = await fn();
    console.log(`  ${PASS} ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    ok = false;
    failed = true;
    console.log(`  ${FAIL} ${label}`);
    console.log(`      ${err.message.split('\n')[0]}`);
    if (err.hint) console.log(`      [2m${err.hint}[0m`);
  }
  return ok;
}

function problem(message, hint) {
  const err = new Error(message);
  err.hint = hint;
  return err;
}

console.log('\nStride preflight\n');

// ---------------------------------------------------------------- environment
await check('Node version', () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw problem(`Node ${process.versions.node} is too old.`, 'Stride needs Node 20 or newer.');
  return `v${process.versions.node}`;
});

await check('ANTHROPIC_API_KEY present', () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw problem(
      'Not set.',
      'Copy .env.example to .env and add your key from https://console.anthropic.com/settings/keys',
    );
  }
  if (!key.startsWith('sk-ant-')) throw problem('Set, but does not look like an Anthropic key (expected an sk-ant- prefix).');
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
});

// ------------------------------------------------------------------- binaries
await check('ffmpeg binary', async () => {
  const { stdout } = await execFileAsync(ffmpegPath, ['-version']);
  return stdout.split('\n')[0].replace('ffmpeg version ', 'v').split(' ')[0];
});

await check('ffprobe binary', async () => {
  const { stdout } = await execFileAsync(ffprobeStatic.path, ['-version']);
  return stdout.split('\n')[0].replace('ffprobe version ', 'v').split(' ')[0];
});

// -------------------------------------------------------------- internal data
await check('Knowledge base', () => {
  const incomplete = CONDITIONS.filter(
    (c) => !c.name || !c.gaitSigns || !c.diagnostics?.length || !c.remedies?.immediate,
  );
  if (incomplete.length) throw problem(`Incomplete entries: ${incomplete.map((c) => c.name).join(', ')}`);
  const tokens = Math.round(buildKnowledgePrompt().length / 4);
  return `${CONDITIONS.length} conditions, ~${tokens} tokens`;
});

await check('Report schema', () => {
  const banned = ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern'];
  const problems = [];
  (function walk(node, path) {
    if (!node || typeof node !== 'object') return;
    for (const key of banned) if (key in node) problems.push(`${path}: unsupported constraint "${key}"`);
    if (node.type === 'object') {
      if (node.additionalProperties !== false) problems.push(`${path}: missing additionalProperties:false`);
      const props = Object.keys(node.properties ?? {});
      const missing = props.filter((p) => !(node.required ?? []).includes(p));
      if (missing.length) problems.push(`${path}: not in required — ${missing.join(', ')}`);
      for (const [key, value] of Object.entries(node.properties ?? {})) walk(value, `${path}.${key}`);
    }
    if (node.type === 'array') walk(node.items, `${path}[]`);
  })(REPORT_SCHEMA, 'root');
  if (problems.length) throw problem(problems[0]);
  return 'valid for structured outputs';
});

// ------------------------------------------------------------------- live API
// Only worth attempting if a key is present; otherwise it just repeats the failure.
if (process.env.ANTHROPIC_API_KEY) {
  const client = new Anthropic();

  const authOk = await check('Anthropic API reachable and key valid', async () => {
    try {
      const response = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      });
      const text = response.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
      return `claude-opus-5 responded "${text}"`;
    } catch (err) {
      if (err?.status === 401) throw problem('Key rejected (401).', 'Check the key is current and not revoked.');
      if (err?.status === 403) throw problem('Key lacks permission for claude-opus-5 (403).');
      if (err?.status === 429) throw problem('Rate limited (429).', 'The key works; you are over quota right now.');
      throw problem(err?.message ?? String(err));
    }
  });

  // Skipped when auth already failed — it would only restate the same 401.
  if (authOk) await check('Web search tool available', async () => {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: 'Search the web for the AAEP equine lameness scale and name its range.' }],
    });
    const searched = response.content.some((b) => b.type === 'server_tool_use' || b.type === 'web_search_tool_result');
    if (!searched) {
      console.log(`      ${WARN} accepted, but the model chose not to search on this probe`);
    }
    return searched ? 'search executed' : 'tool accepted';
  });

  // The API compiles each schema into a grammar and rejects one that is too
  // large. That ceiling is not documented as a field count, and the report
  // schema once crossed it by a single added field, so it is checked live.
  if (authOk) await check('Report schemas compile', async () => {
    const sizes = [];
    for (const [name, schema] of [['assessment', ASSESSMENT_SCHEMA], ['plan', PLAN_SCHEMA]]) {
      try {
        await client.messages.create({
          model: 'claude-opus-5',
          max_tokens: 64,
          output_config: { format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content: 'Return a minimal valid object.' }],
        });
        sizes.push(`${name} ok`);
      } catch (err) {
        if (/grammar is too large/.test(err?.error?.error?.message ?? err?.message ?? '')) {
          throw problem(
            `The ${name} schema is too large for the API to compile.`,
            'Move fields into the other schema in src/schema.js, or split it again.',
          );
        }
        throw problem(err?.message ?? String(err));
      }
    }
    return sizes.join(', ');
  });
}

// ------------------------------------------------------- optional real footage
const videoArg = process.argv[2];
if (videoArg) {
  await check(`Frame extraction from ${videoArg}`, async () => {
    // Same defaults as the server, so what this reports is what production does.
    const { meta, frames, sampling } = await extractFrames(videoArg, 18, 3);
    const kb = Math.round(frames.reduce((sum, f) => sum + f.base64.length, 0) / 1024);
    const orientation = meta.rotated ? ' (rotated)' : '';
    return (
      `${frames.length} frames in ${sampling.bursts} burst(s) of ${sampling.perBurst}, ` +
      `${sampling.span}s span, ${sampling.motionGuided ? 'motion-guided' : 'evenly spaced'}; ` +
      `${meta.duration.toFixed(1)}s, ${meta.width}x${meta.height}${orientation}, ~${kb}KB`
    );
  });
} else {
  console.log(`  ${WARN} Frame extraction not tested — pass a video path to check real footage:`);
  console.log('      [2mnpm run doctor -- ./my-horse-clip.mp4[0m');
}

console.log(
  failed
    ? `\n${FAIL} Preflight failed. Fix the items above before running npm start.\n`
    : `\n${PASS} All checks passed. Run npm start and open http://localhost:${process.env.PORT ?? 3000}\n`,
);
process.exit(failed ? 1 : 0);
