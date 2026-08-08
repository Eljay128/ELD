/**
 * Folds the built app into one self-contained HTML file with no external
 * requests — handy for emailing, dropping on any host, or opening from a USB
 * stick. Run after `npm run build`.
 *
 *   node scripts/build-single-file.mjs [outfile]
 *
 * Passing `--fragment` emits the page without the <!doctype>/<html>/<head>/
 * <body> wrapper, for hosts that supply their own document shell.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outFile = args.find((a) => !a.startsWith('--')) ?? join(DIST, 'pourfolio-single-file.html');

const html = await readFile(join(DIST, 'index.html'), 'utf8');

const cssHref = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/.exec(html)?.[1];
const jsSrc = /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
if (!cssHref || !jsSrc) throw new Error('Could not find the built CSS/JS in dist/index.html — run `npm run build` first.');

const css = await readFile(join(DIST, cssHref.replace(/^\.?\//, '')), 'utf8');
const js = await readFile(join(DIST, jsSrc.replace(/^\.?\//, '')), 'utf8');

/** A literal `</script` inside the bundle would close the tag early. */
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'Pourfolio';
const description =
  /<meta[^>]+name="description"[^>]+content="([^"]*)"/.exec(html)?.[1] ??
  'Build your beverage preference profile and share it peer-to-peer.';

const body = `<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>`;

const page = fragment
  ? `<title>${title}</title>\n${body}\n`
  : `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="light dark" />
<meta name="description" content="${description}" />
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;

await writeFile(outFile, page);
console.log(`✓ ${outFile} — ${(page.length / 1024).toFixed(0)} KB, zero external requests`);
