/**
 * End-to-end smoke test against the built app.
 *
 * Drives two independent browser contexts — "Ada" and "Bo" — through the real
 * flow: build a profile, generate a share code, import it in the other browser,
 * and produce a coffee-run sheet. Two contexts matter because each has its own
 * localStorage, which is exactly the peer boundary the app is built around.
 *
 *   node scripts/smoke.mjs            (expects `npm run build` first)
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(DIST, path === '/' ? 'index.html' : path);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/**
 * Use whatever Chromium this machine already has rather than downloading one.
 * The pre-installed build often does not match the revision this Playwright
 * version would fetch, and for a smoke test any recent Chromium will do.
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = globSyncDirs('/opt/pw-browsers');
  for (const dir of roots) {
    for (const candidate of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const full = join('/opt/pw-browsers', dir, candidate);
      if (existsSync(full)) return full;
    }
  }
  return undefined;
}

function globSyncDirs(root) {
  try {
    return readdirSync(root).filter((d) => d.startsWith('chromium'));
  } catch {
    return [];
  }
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

/**
 * Open the add-drink editor from a daypart section. Scoped to the section's
 * heading rather than its text: occasion chips like "Every day" would otherwise
 * make the Morning section match a search for "Day".
 */
async function addTo(page, daypart) {
  await page
    .locator('section')
    .filter({ has: page.locator('h2', { hasText: daypart }) })
    .first()
    .getByRole('button', { name: '+ Add' })
    .click();
}

async function newPeer(name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForSelector('.brandmark');
  return { name, context, page, errors };
}

try {
  // --- Ada builds a profile ------------------------------------------------
  const ada = await newPeer('Ada');

  // Identity and constraints live in the secondary "Edit profile" view so the
  // home page stays a profile rather than a form.
  await ada.page.getByRole('button', { name: 'Edit profile', exact: true }).first().click();
  await ada.page.getByPlaceholder('What peers should call you').fill('Ada');
  await ada.page.getByPlaceholder('Oat milk or nothing. Decaf after 2pm.').fill('Oat milk or nothing.');
  await ada.page.getByRole('button', { name: 'Dairy-free', exact: true }).click();
  await ada.page.getByPlaceholder(/Severe tree-nut allergy/).fill('Tree nut allergy — no almond milk.');
  await ada.page.getByRole('button', { name: 'Done', exact: true }).click();
  await ada.page.waitForSelector('.modal', { state: 'detached' });

  check('identity edits land on the profile header', (await ada.page.locator('.identity-text h1').textContent()) === 'Ada');
  check('allergy is surfaced on the profile itself', await ada.page.locator('.constraint-row .tag.danger').isVisible());

  // Add a morning drink at Starbucks with real customization.
  await addTo(ada.page, 'Morning');
  await ada.page.getByRole('button', { name: /Starbucks/ }).click();
  await ada.page.getByRole('button', { name: 'Caffè Latte', exact: true }).click();
  await ada.page.waitForSelector('.banner');

  const beforeCustom = await ada.page.locator('.banner .muted').first().textContent();
  await ada.page.getByRole('button', { name: /^Oat milk/ }).click();
  await ada.page.getByRole('button', { name: /^Venti/ }).click();
  const afterCustom = await ada.page.locator('.banner .muted').first().textContent();
  check('editor preview updates as options change', beforeCustom !== afterCustom, `"${beforeCustom}" -> "${afterCustom}"`);
  check('chosen options appear in the spoken line', /Venti/.test(afterCustom) && /Oat milk/i.test(afterCustom), afterCustom);
  check(
    'house defaults are left out of the spoken line',
    !/House cup|Lid on|Regular ice|Signature Espresso Roast/.test(afterCustom),
    afterCustom,
  );

  // The dairy-free flag should visibly conflict once a dairy option is picked.
  await ada.page.getByRole('button', { name: 'Whipped cream', exact: true }).click();
  const conflictShown = await ada.page.locator('.banner.warn').count();
  check('dairy-free conflict warns when a dairy option is chosen', conflictShown > 0);
  await ada.page.getByRole('button', { name: 'Whipped cream', exact: true }).click();

  await ada.page.getByRole('button', { name: 'Save to my profile' }).click();
  await ada.page.waitForSelector('.drink-card');
  check('order saved to profile', (await ada.page.locator('.drink-card').count()) === 1);

  // Mark it as the go-to so peers know what to buy.
  await ada.page.locator('.drink-card').first().getByRole('button', { name: '☆' }).click();
  check('go-to marking works', (await ada.page.locator('.drink-card.fav').count()) === 1);

  // An adult-beverage entry, to prove the fourth daypart round-trips too.
  await addTo(ada.page, 'Adult');
  await ada.page.getByRole('button', { name: /Bar & adult beverages/ }).click();
  await ada.page.getByRole('button', { name: 'Negroni', exact: true }).click();
  await ada.page.getByRole('button', { name: 'Save to my profile' }).click();
  check('adult beverage saved', (await ada.page.locator('.drink-card').count()) === 2);

  // Persistence across a reload — the whole app depends on this.
  await ada.page.reload();
  await ada.page.waitForSelector('.drink-card');
  check('profile survives a reload', (await ada.page.locator('.drink-card').count()) === 2);

  // Metrics and the segmented filter are the two new structural pieces.
  const metricValues = await ada.page.locator('.metric-value').allTextContents();
  check('metrics count the saved drinks', metricValues[0] === '2', metricValues.join(' / '));
  check('metrics count distinct shops', metricValues[1] === '2', metricValues.join(' / '));
  check('go-to metric counts covered dayparts', metricValues[2] === '1/4', metricValues.join(' / '));
  await ada.page.locator('.segmented button', { hasText: 'Adult' }).click();
  check('segmented filter narrows the grid', (await ada.page.locator('.drink-card').count()) === 1);
  await ada.page.locator('.segmented button', { hasText: 'All' }).click();
  check('segmented filter restores the grid', (await ada.page.locator('.drink-card').count()) === 2);

  // The overflow menu holds the extended operations.
  await ada.page.getByRole('button', { name: 'More profile actions' }).click();
  check('overflow menu opens', await ada.page.locator('.menu[role="menu"]').isVisible());
  await ada.page.keyboard.press('Escape');
  check('overflow menu closes on Escape', (await ada.page.locator('.menu[role="menu"]').count()) === 0);

  // --- Ada shares ----------------------------------------------------------
  await ada.page.getByRole('button', { name: 'Share', exact: true }).click();
  const link = await ada.page.locator('textarea.code').first().inputValue();
  check('share link generated', link.includes('#add=PF1.'), `${link.length} chars`);
  const qrPresent = await ada.page.locator('.qr-wrap svg').count();
  check('QR code rendered locally', qrPresent === 1);

  // --- Bo imports Ada by opening the link ----------------------------------
  const bo = await newPeer('Bo');
  await bo.page.getByRole('button', { name: 'Edit profile', exact: true }).first().click();
  await bo.page.getByPlaceholder('What peers should call you').fill('Bo');
  await bo.page.getByRole('button', { name: 'Done', exact: true }).click();
  await bo.page.waitForSelector('.modal', { state: 'detached' });
  const linkPath = link.slice(link.indexOf('#'));
  await bo.page.goto(base + linkPath);
  await bo.page.waitForSelector('.card');
  await bo.page.getByRole('button', { name: /^People/ }).click();
  const adaCard = bo.page.locator('.card', { hasText: 'Ada' }).first();
  check('peer imported from share link', (await adaCard.count()) > 0);
  check('URL cleaned after import', !bo.page.url().includes('add=PF1'), bo.page.url());

  const cardText = await adaCard.textContent();
  check('dietary flag carried across', /Dairy-free/.test(cardText), cardText?.slice(0, 120));
  check('allergy warning carried across', /allergy/i.test(cardText));

  // The full card a peer reads at the counter.
  await adaCard.getByRole('button', { name: 'View card' }).click();
  const detail = await bo.page.locator('.modal').textContent();
  check('peer card shows the exact drink', /Caffè Latte/.test(detail) && /Oat milk/i.test(detail));
  check('peer card shows the allergy note', /Tree nut allergy/.test(detail));
  check('adult beverage came across', /Negroni/.test(detail));
  await bo.page.keyboard.press('Escape');
  await bo.page.waitForSelector('.modal', { state: 'detached' });
  check('Escape closes the peer card', (await bo.page.locator('.modal').count()) === 0);

  // --- Bo runs a coffee run ------------------------------------------------
  await adaCard.getByRole('button', { name: '+ Coffee run' }).click();
  await bo.page.getByRole('button', { name: /^Coffee run/ }).click();
  await bo.page.locator('.card').first().getByRole('button', { name: /Morning/ }).click();
  await bo.page.waitForSelector('.sheet');
  const sheet = await bo.page.locator('.sheet').textContent();
  check('run sheet groups by shop', /Starbucks/.test(sheet));
  check('run sheet names the person and drink', /Ada/.test(sheet) && /Caffè Latte/.test(sheet), sheet?.slice(0, 160));
  const warnings = await bo.page.locator('.banner.danger').count();
  check('run sheet surfaces the allergy before ordering', warnings > 0);

  // --- Re-import is idempotent --------------------------------------------
  await bo.page.getByRole('button', { name: 'Share', exact: true }).click();
  await bo.page.locator('textarea.code').last().fill(link);
  await bo.page.getByRole('button', { name: 'Import', exact: true }).click();
  await bo.page.waitForSelector('.toast');
  const toast = await bo.page.locator('.toast').textContent();
  check('re-importing the same profile does not duplicate', /already up to date/i.test(toast), toast);
  await bo.page.getByRole('button', { name: /^People/ }).click();
  check('peer list still has exactly one Ada', (await bo.page.locator('.card', { hasText: 'Ada' }).count()) === 1);

  // --- Bad input is handled, not crashed on -------------------------------
  await bo.page.getByRole('button', { name: 'Share', exact: true }).click();
  await bo.page.locator('textarea.code').last().fill('PF1.thisIsNotRealData');
  await bo.page.getByRole('button', { name: 'Import', exact: true }).click();
  const err = await bo.page.locator('.banner.danger').first().textContent();
  check('damaged code reports an error instead of crashing', /damaged|incomplete|not a/i.test(err), err);

  // --- No console errors anywhere -----------------------------------------
  for (const peer of [ada, bo]) {
    check(`${peer.name}: no console or page errors`, peer.errors.length === 0, peer.errors.slice(0, 2).join(' | '));
  }

  await ada.context.close();
  await bo.context.close();
} catch (e) {
  check('test run completed without throwing', false, String(e).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
