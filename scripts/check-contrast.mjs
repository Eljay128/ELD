/**
 * Contrast check for both palettes.
 *
 * Reads the actual token values out of `src/styles.css` rather than restating
 * them, so the check cannot drift from the stylesheet it is checking. It caught
 * a real regression on its first run: strengthening the dark theme's amber wash
 * pushed white-on-wash to 4.00:1, under the 4.5 threshold.
 *
 *   node scripts/check-contrast.mjs
 */

import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

/** Pull the custom properties out of one selector block. */
function tokensIn(startPattern) {
  const at = css.search(startPattern);
  if (at < 0) throw new Error(`Could not find ${startPattern} in styles.css`);
  const block = css.slice(at, css.indexOf('\n}', at));
  const out = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}

const light = tokensIn(/^:root \{/m);
const dark = tokensIn(/^:root\[data-theme='dark'\] \{/m);

// --- WCAG relative luminance ------------------------------------------------

function rgb(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) throw new Error(`Not a plain hex colour: ${value}`);
  let h = hex[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (value) => {
  const [r, g, b] = rgb(value).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs that actually carry meaning on screen. */
const PAIRS = [
  ['body text on the ground', 'text', 'bg', 4.5],
  ['body text on a surface', 'text', 'surface', 4.5],
  ['secondary text on the ground', 'text-dim', 'bg', 4.5],
  ['faint text on the ground', 'text-faint', 'bg', 3],
  ['heading text over the wash', 'text', 'wash-top', 4.5],
  ['button ink on the accent fill', 'accent-text', 'accent', 4.5],
  ['accent ink on its own chip', 'accent-ink', 'accent-soft', 4.5],
  ['danger text on its banner', 'danger', 'danger-soft', 4.5],
  ['warning text on its banner', 'warn', 'warn-soft', 4.5],
  ['ok text on its tag', 'ok', 'ok-soft', 4.5],
];

let failures = 0;
for (const [name, tokens] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(`\n--- ${name} ---`);
  for (const [label, fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.log(`SKIP  ${label} — missing --${fg} or --${bg}`);
      continue;
    }
    const value = contrast(tokens[fg], tokens[bg]);
    const ok = value >= min;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(30)} ${value.toFixed(2)}:1  (needs ${min})`);
  }
}

console.log(failures ? `\n✗ ${failures} contrast failure(s)` : '\n✓ both palettes pass contrast');
process.exit(failures ? 1 : 0);
