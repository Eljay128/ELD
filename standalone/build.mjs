/* Assembles standalone/stride.html — one file, no server, no build deps.
   Pulls the prompts, knowledge base and schema straight out of src/ so the
   standalone can never drift from the server version. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { OBSERVER_SYSTEM, REPORT_SYSTEM, VIEW_PURPOSE } from '../src/analyze.js';
import { buildKnowledgePrompt } from '../src/knowledge.js';
import { ASSESSMENT_SCHEMA, PLAN_SCHEMA } from '../src/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (p) => readFile(join(root, p), 'utf8');

const RENDER_START = '// ------------------------------------------------------------------ report';
const RENDER_END = '// ----------------------------------------------------------------- controls';

/** The report renderers are shared verbatim with the served app. Slicing them
 *  out beats maintaining a second copy that quietly diverges. */
function sliceRenderer(source) {
  const from = source.indexOf(RENDER_START);
  const to = source.indexOf(RENDER_END);
  if (from < 0 || to < 0) throw new Error('Could not find the renderer markers in public/app.js.');
  return source.slice(from, to).trim();
}

/** The page must stay one file, so the webfont is inlined rather than fetched. */
async function inlineFonts(css) {
  const font = await readFile(join(root, 'public/fonts/outfit-variable.woff2'));
  return css.replace(
    "url('fonts/outfit-variable.woff2') format('woff2-variations')",
    `url(data:font/woff2;base64,${font.toString('base64')}) format('woff2-variations')`,
  );
}

const [css, appJs, shell, template, mp4, webcodecs] = await Promise.all([
  read('public/styles.css').then(inlineFonts),
  read('public/app.js'),
  read('standalone/shell.html'),
  read('standalone/app.template.js'),
  read('standalone/mp4.js'),
  read('standalone/webcodecs.js'),
]);

// The decode modules are authored as ES modules so they can be unit-tested in
// Node against real files. The page runs one classic script, so strip the module
// syntax and concatenate rather than shipping a second script tag.
const asPlainScript = (src) =>
  src.replace(/^import\s.*?;\s*$/gm, '').replace(/^export\s+(?=(async\s+)?function|const|class)/gm, '');

const config = {
  knowledge: buildKnowledgePrompt(),
  observerSystem: OBSERVER_SYSTEM,
  reportSystem: REPORT_SYSTEM,
  viewPurpose: VIEW_PURPOSE,
  assessmentSchema: ASSESSMENT_SCHEMA,
  planSchema: PLAN_SCHEMA,
};

// </script> inside a JSON string literal would close the host <script> tag.
const configJson = JSON.stringify(config).replaceAll('</', '<\\/');

const app = [
  asPlainScript(mp4),
  asPlainScript(webcodecs),
  template.replace('__RENDERER__', () => sliceRenderer(appJs)),
].join('\n\n');

const html = shell
  .replace('/*__CSS__*/', () => css)
  .replace('/*__CONFIG__*/', () => configJson)
  .replace('/*__APP__*/', () => app);

for (const marker of ['__CSS__', '__CONFIG__', '__APP__', '__RENDERER__']) {
  if (html.includes(marker)) throw new Error(`Placeholder ${marker} was never substituted.`);
}

// Two outputs from one build: the file you open locally, and docs/index.html,
// which is what GitHub Pages serves. Same bytes — writing both here is what
// stops the hosted copy drifting behind the local one.
const size = `${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`;

await writeFile(join(here, 'stride.html'), html);
console.log(`standalone/stride.html — ${size}`);

await mkdir(join(root, 'docs'), { recursive: true });
await writeFile(join(root, 'docs', 'index.html'), html);
// Tells Pages to serve the directory as-is instead of running it through Jekyll.
await writeFile(join(root, 'docs', '.nojekyll'), '');
console.log(`docs/index.html — ${size} (GitHub Pages)`);
