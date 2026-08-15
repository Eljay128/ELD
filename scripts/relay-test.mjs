/**
 * The always-on test.
 *
 * Everything else in the suite proves rounds move between two *connected*
 * browsers. This proves the thing that actually needed a server: Ada buys a
 * round while Bo's app is **closed**, and Bo sees it when he next opens it.
 *
 * The relay is started in-process, and the browser contexts are fully
 * independent — separate localStorage, separate identity, separate keys.
 *
 *   node scripts/relay-test.mjs      (expects `npm run build` first)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const RELAY_PORT = 8791;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    for (const dir of readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium'))) {
      for (const c of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const full = join('/opt/pw-browsers', dir, c);
        if (existsSync(full)) return full;
      }
    }
  } catch {
    /* fall through to Playwright's own default */
  }
  return undefined;
}

// --- static host for the built app -----------------------------------------

const app = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = join(DIST, path === '/' ? 'index.html' : path);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.address().port}/`;

// --- the relay, in a real child process -------------------------------------

const relay = spawn(process.execPath, [new URL('../relay/server.mjs', import.meta.url).pathname], {
  env: { ...process.env, PORT: String(RELAY_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
relay.stderr.on('data', (d) => console.error('[relay stderr]', String(d).trim()));

const relayUrl = `http://127.0.0.1:${RELAY_PORT}`;
await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${relayUrl}/v1/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('relay did not start');
})();

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function open(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.waitForSelector('.brandmark');
  return { page, errors };
}

async function setName(page, name) {
  await page.getByRole('button', { name: 'Edit profile', exact: true }).first().click();
  await page.getByPlaceholder('What peers should call you').fill(name);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForSelector('.modal', { state: 'detached' });
}

async function addDrink(page) {
  await page
    .locator('section')
    .filter({ has: page.locator('h2', { hasText: 'Morning' }) })
    .first()
    .getByRole('button', { name: '+ Add' })
    .click();
  await page.getByRole('button', { name: /Starbucks/ }).click();
  await page.getByRole('button', { name: 'Caffè Latte', exact: true }).click();
  await page.getByRole('button', { name: 'Save to my profile' }).click();
  await page.waitForSelector('.drink-card');
}

async function shareLink(page) {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  return page.locator('textarea.code').first().inputValue();
}

async function turnRelayOn(page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByPlaceholder('http://localhost:8787').fill(relayUrl);
  await page.getByRole('button', { name: 'Check this relay' }).click();
  await page.waitForSelector('.banner.ok');
  await page.getByRole('button', { name: 'Switch it on' }).click();
  await page.waitForSelector('.tag.ok', { timeout: 10_000 });
}

try {
  const health = await (await fetch(`${relayUrl}/v1/health`)).json();
  check('relay reports what it stores', health.stores?.includes('sealed envelopes only'), health.stores);

  // --- both sides set up, exchange profiles, and enable the relay ----------
  const adaCtx = await browser.newContext();
  const boCtx = await browser.newContext();
  const ada = await open(adaCtx);
  const bo = await open(boCtx);

  await setName(ada.page, 'Ada');
  await addDrink(ada.page);
  await setName(bo.page, 'Bo');
  await addDrink(bo.page);

  const adaLink = await shareLink(ada.page);
  const boLink = await shareLink(bo.page);
  await bo.page.goto(base + adaLink.slice(adaLink.indexOf('#')));
  await bo.page.waitForSelector('.grid .card');
  await ada.page.goto(base + boLink.slice(boLink.indexOf('#')));
  await ada.page.waitForSelector('.grid .card');
  check('both sides imported each other', true);

  await turnRelayOn(ada.page);
  await turnRelayOn(bo.page);
  check('both clients connect to the relay', true);

  // --- Bo closes his app entirely -----------------------------------------
  await bo.page.close();
  await new Promise((r) => setTimeout(r, 300));
  const liveHealth = await (await fetch(`${relayUrl}/v1/health`)).json();
  check('relay knows both identities', liveHealth.identities === 2, `identities=${liveHealth.identities}`);

  // --- Ada buys a round while Bo is away ----------------------------------
  await ada.page.getByRole('button', { name: /^Rounds/ }).click();
  await ada.page.getByRole('button', { name: 'Log a round' }).first().click();
  await ada.page.locator('.modal').getByRole('button', { name: /Bo/ }).last().click();
  await ada.page.locator('.modal').getByRole('button', { name: 'Log it' }).click();
  await ada.page.waitForSelector('.feed-item');

  // Wait for the relay to actually be holding it.
  let pending = 0;
  for (let i = 0; i < 50; i++) {
    const h = await (await fetch(`${relayUrl}/v1/health`)).json();
    pending = h.pending;
    if (pending > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check('the relay is holding a round for the absent peer', pending === 1, `pending=${pending}`);

  // The relay must be holding ciphertext, not a drink order.
  const rawDump = JSON.stringify(await (await fetch(`${relayUrl}/v1/health`)).json());
  check('relay exposes no plaintext in its own status', !/Latte|Ada|Bo\b/.test(rawDump), rawDump.slice(0, 80));

  // --- Bo reopens, having been closed the entire time ----------------------
  const bo2 = await open(boCtx);
  await bo2.page.getByRole('button', { name: /^Rounds/ }).click();
  await bo2.page.waitForSelector('.feed-item', { timeout: 15_000 });
  const feedText = await bo2.page.locator('.feed-item').first().textContent();

  check('a round arrives for a peer whose app was CLOSED', /Ada bought/.test(feedText ?? ''), feedText?.slice(0, 80));
  check('the delivered round names the right drink', /Caff/.test(feedText ?? ''), feedText?.slice(0, 110));
  check('the delivered round is signature-verified', /Verified/.test(feedText ?? ''), feedText?.slice(0, 110));

  // --- and the relay forgets once delivered -------------------------------
  let after = 1;
  for (let i = 0; i < 50; i++) {
    const h = await (await fetch(`${relayUrl}/v1/health`)).json();
    after = h.pending;
    if (after === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check('the relay forgets the round once acknowledged', after === 0, `pending=${after}`);

  // --- an ID cannot be claimed by a key that does not hash to it ----------
  const hijack = await fetch(`${relayUrl}/v1/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'totally-made-up', alg: 'Ed25519', publicKey: 'AAAA' }),
  });
  check('relay refuses an ID that is not its key fingerprint', hijack.status === 400, `status=${hijack.status}`);

  // --- an unauthenticated mailbox read is refused -------------------------
  const peek = await fetch(`${relayUrl}/v1/mailbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'anything', nonce: 'x', sig: 'y' }),
  });
  check('relay refuses an unauthenticated mailbox read', peek.status === 403, `status=${peek.status}`);

  for (const [name, peer] of [
    ['Ada', ada],
    ['Bo', bo2],
  ]) {
    check(`${name}: no console or page errors`, peer.errors.length === 0, peer.errors.slice(0, 2).join(' | '));
  }

  await adaCtx.close();
  await boCtx.close();
} catch (e) {
  check('relay test completed without throwing', false, String(e).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
  relay.kill();
  app.close();
}

console.log('\n' + results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
