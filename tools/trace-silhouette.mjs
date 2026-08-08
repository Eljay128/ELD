/**
 * Trace a silhouette image into an SVG path for the app's artwork.
 *
 *   node tools/trace-silhouette.mjs <image> [--out name] [--linework]
 *
 * Pass --linework for an outline drawing rather than a solid silhouette: the
 * enclosed area is filled before tracing, so the result follows the horse
 * rather than the pencil strokes. Tune with --radius (how far strokes are
 * thickened to close gaps) and --threshold (how dark counts as ink) if the fill
 * leaks out or fails to take — the calibration render shows which happened.
 *
 * Produces tools/out/<name>.json with the normalized path, and
 * tools/out/<name>.html — a calibration render with every fifth point indexed,
 * which is how the leg runs are identified when the artwork needs to be split
 * for animation (see standalone/shell.html's trotter).
 *
 * Only trace artwork you have the right to use. Anything traced here ends up
 * published in the standalone build.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Playwright is not a project dependency — it is only needed for this one
// dev-time tool, and pulling a browser into every install would be rude.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('This tool needs Playwright, which is not a dependency of the app.');
  console.error('Install it just for this: npm i -D playwright');
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.error('usage: node tools/trace-silhouette.mjs <image> [--out name] [--height 78]');
  process.exit(1);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const name = flag('out', basename(src, extname(src)).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
const VBW = 120;
const PAD = 2;

const mime = extname(src).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
const dataUri = `data:${mime};base64,${readFileSync(src).toString('base64')}`;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();

const traced = await page.evaluate(async ({ uri, LINEWORK, R, THRESHOLD }) => {
  const img = new Image();
  img.src = uri;
  await img.decode();

  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const W = c.width, H = c.height;

  const dark = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = (y * W + x) * 4;
    if (data[i + 3] < 128) return false;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < THRESHOLD;
  };

  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!dark(x, y)) continue;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (!count) return { error: 'no dark pixels found — is the subject solid and the background light?' };

  /* Line art needs filling before it can be traced, or the contour follows the
     strokes rather than the animal. Dilating first closes small gaps in the
     linework that would otherwise let the flood fill leak inside and swallow
     the whole drawing. */
  let inside = null;
  if (LINEWORK) {
    const thick = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!dark(x, y)) continue;
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H) thick[ny * W + nx] = 1;
          }
        }
      }
    }

    // Flood the background inward from the border; whatever it cannot reach is
    // enclosed by the drawing.
    const outside = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
    for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (outside[i] || thick[i]) continue;
      outside[i] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    // Largest enclosed blob only, so a ground line or a stray logo is dropped.
    const label = new Int32Array(W * H).fill(-1);
    let best = -1, bestSize = 0;
    for (let seed = 0; seed < W * H; seed++) {
      if (outside[seed] || label[seed] !== -1) continue;
      const id = seed;
      let size = 0;
      const q = [seed];
      label[seed] = id;
      while (q.length) {
        const i = q.pop();
        size++;
        const x = i % W, y = (i / W) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (outside[j] || label[j] !== -1) continue;
          label[j] = id;
          q.push(j);
        }
      }
      if (size > bestSize) { bestSize = size; best = id; }
    }
    inside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) if (label[i] === best) inside[i] = 1;

    // Undo the dilation so the outline sits where the drawing put it.
    const eroded = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inside[y * W + x]) continue;
        let keep = 1;
        for (let dy = -R; dy <= R && keep; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !inside[ny * W + nx]) { keep = 0; break; }
          }
        }
        eroded[y * W + x] = keep;
      }
    }
    inside = eroded;

    minX = W; minY = H; maxX = 0; maxY = 0; count = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inside[y * W + x]) continue;
        count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (!count) return { error: 'filling the linework produced nothing — the outline may have a gap in it' };
  }

  const solid = LINEWORK
    ? (x, y) => x >= 0 && y >= 0 && x < W && y < H && inside[y * W + x] === 1
    : dark;

  let start = null;
  outer: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid(x, y)) { start = [x, y]; break outer; }

  // Moore-neighbour boundary following.
  const N = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const contour = [];
  let cur = start, dir = 0, guard = 0;
  do {
    contour.push(cur);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cur[0] + N[d][0], ny = cur[1] + N[d][1];
      if (solid(nx, ny)) { cur = [nx, ny]; dir = d; found = true; break; }
    }
    if (!found) break;
  } while (!(cur[0] === start[0] && cur[1] === start[1]) && ++guard < 400000);

  const rdp = (pts, eps) => {
    if (pts.length < 3) return pts;
    let idx = 0, dmax = 0;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > dmax) { idx = i; dmax = d; }
    }
    return dmax > eps
      ? [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
      : [pts[0], pts[pts.length - 1]];
  };

  return { W, H, count, box: { minX, minY, maxX, maxY }, raw: contour.length, points: rdp(contour, 1.2) };
}, {
  uri: dataUri,
  LINEWORK: args.includes('--linework'),
  // Linework needs thicker strokes and a looser ink threshold than a solid
  // silhouette, or the flood fill slips through a gap in the drawing.
  R: Number(flag('radius', args.includes('--linework') ? 4 : 1)),
  THRESHOLD: Number(flag('threshold', args.includes('--linework') ? 170 : 128)),
});

if (traced.error) { console.error(traced.error); await browser.close(); process.exit(1); }

const { minX, minY, maxX, maxY } = traced.box;
const scale = (VBW - PAD * 2) / (maxX - minX);
const VBH = Math.round((maxY - minY) * scale) + PAD * 2;
const pts = traced.points.map(([x, y]) => [
  +(PAD + (x - minX) * scale).toFixed(2),
  +(PAD + (y - minY) * scale).toFixed(2),
]);
const d = `M${pts.map((p) => p.join(' ')).join('L')}Z`;

const outDir = join(HERE, 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ viewBox: `0 0 ${VBW} ${VBH}`, path: d, points: pts }, null, 2));

writeFileSync(join(outDir, `${name}.html`), `<body style="margin:0;background:#faf6f2;font:12px sans-serif">
<svg viewBox="0 0 ${VBW} ${VBH}" style="width:820px"><path d="${d}" fill="#7a4a68"/></svg>
<svg viewBox="0 0 ${VBW} ${VBH}" style="width:820px"><path d="${d}" fill="#7a4a68" opacity="0.25"/>
${pts.map((p, i) => (i % 5 === 0
  ? `<circle cx="${p[0]}" cy="${p[1]}" r="0.6" fill="#0af"/><text x="${p[0] + 0.8}" y="${p[1]}" font-size="2.4" fill="#036">${i}</text>`
  : '')).join('')}</svg>
<p style="padding:0 10px">Every fifth point indexed — use these to find where each leg leaves and rejoins the barrel.</p></body>`);

await page.goto(`file://${join(outDir, `${name}.html`)}`);
await page.setViewportSize({ width: 860, height: 900 });
await page.screenshot({ path: join(outDir, `${name}.jpg`), type: 'jpeg', quality: 88, fullPage: true });
await browser.close();

console.log(`subject ${maxX - minX}x${maxY - minY}px in a ${traced.W}x${traced.H} image`);
console.log(`${traced.raw} pixel steps -> ${pts.length} points`);
console.log(`viewBox 0 0 ${VBW} ${VBH}`);
console.log(`wrote tools/out/${name}.json, .html and .jpg`);
