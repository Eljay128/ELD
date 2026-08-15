/**
 * Pourfolio relay.
 *
 * A mailbox, not a database. It holds sealed envelopes addressed to a profile
 * ID, pushes them to whoever is connected, and forgets them once acknowledged
 * or after a TTL. It cannot read a round: every envelope is AES-GCM ciphertext
 * the client sealed for one specific recipient.
 *
 * What it deliberately does NOT do:
 *   - store profiles, drinks, names, or anything human-readable
 *   - let anyone read a mailbox they cannot cryptographically prove they own
 *   - accept an envelope from a sender who has not proved the same
 *   - keep anything after it has been delivered and acknowledged
 *
 * Run it:
 *   node relay/server.mjs                  # port 8787, memory only
 *   PORT=9000 DATA=./relay-data.json node relay/server.mjs
 *
 * There is no default relay. The client ships with the feature off and no URL,
 * so nothing reaches a server unless someone deliberately points it at one.
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_FILE = process.env.DATA ?? '';
const TTL_MS = Number(process.env.TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;
const MAX_ENVELOPE_BYTES = 64 * 1024;
const MAX_MAILBOX = 500;

// --- state ------------------------------------------------------------------

/** profileId → { alg, publicKey } — write-once, so an ID cannot be hijacked. */
const keys = new Map();
/** profileId → envelope[] */
const mailboxes = new Map();
/** profileId → Set<WebSocket> */
const live = new Map();
/** profileId → { nonce, expires } */
const challenges = new Map();
/** ip → { count, resetAt } */
const rate = new Map();

// --- persistence (optional) -------------------------------------------------

async function loadData() {
  if (!DATA_FILE) return;
  try {
    const raw = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    for (const [id, k] of Object.entries(raw.keys ?? {})) keys.set(id, k);
    for (const [id, list] of Object.entries(raw.mailboxes ?? {})) mailboxes.set(id, list);
    console.log(`[relay] restored ${keys.size} keys, ${mailboxes.size} mailboxes`);
  } catch {
    // A missing or unreadable file just means starting empty.
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!DATA_FILE || saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await writeFile(
        DATA_FILE,
        JSON.stringify({ keys: Object.fromEntries(keys), mailboxes: Object.fromEntries(mailboxes) }),
      );
    } catch (e) {
      console.error('[relay] could not persist:', e.message);
    }
  }, 1000);
}

// --- crypto helpers ---------------------------------------------------------

function fromB64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function keyParams(alg) {
  return alg === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
}
function signParams(alg) {
  return alg === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
}

/** Same canonicalisation the client uses — sorted keys at every level. */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(',')}}`;
}

async function verifySignature(profileId, signature, payload) {
  const record = keys.get(profileId);
  if (!record) return false;
  try {
    const key = await crypto.subtle.importKey('raw', fromB64url(record.publicKey), keyParams(record.alg), false, [
      'verify',
    ]);
    return await crypto.subtle.verify(
      signParams(record.alg),
      key,
      fromB64url(signature),
      Buffer.from(canonical(payload), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * A profile ID must be the fingerprint of the key claiming it. This is what
 * makes an ID unclaimable — the relay never has to trust a self-asserted name.
 */
async function fingerprintOf(publicKeyB64) {
  const digest = await crypto.subtle.digest('SHA-256', fromB64url(publicKeyB64));
  return Buffer.from(digest).toString('base64url').slice(0, 16);
}

// --- helpers ----------------------------------------------------------------

function ulid() {
  return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 12);
}

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, list] of mailboxes) {
    const kept = list.filter((e) => e.at > cutoff);
    if (kept.length === 0) mailboxes.delete(id);
    else if (kept.length !== list.length) mailboxes.set(id, kept);
  }
  for (const [id, c] of challenges) if (c.expires < Date.now()) challenges.delete(id);
  scheduleSave();
}
setInterval(prune, 60_000).unref?.();

function rateLimited(ip) {
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || entry.resetAt < now) {
    rate.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 240;
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_ENVELOPE_BYTES * 4) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function deliver(envelope) {
  const sockets = live.get(envelope.to);
  if (!sockets) return;
  const message = JSON.stringify({ type: 'envelope', envelope });
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(message);
  }
}

// --- HTTP -------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (rateLimited(ip)) return send(res, 429, { error: 'Slow down.' });

  const url = new URL(req.url, 'http://relay');

  try {
    // Health, and a plain statement of what this server holds.
    if (req.method === 'GET' && url.pathname === '/v1/health') {
      return send(res, 200, {
        ok: true,
        service: 'pourfolio-relay',
        stores: 'sealed envelopes only — no profiles, no plaintext',
        retentionDays: TTL_MS / 86_400_000,
        identities: keys.size,
        pending: [...mailboxes.values()].reduce((n, l) => n + l.length, 0),
      });
    }

    // Register a public key for an ID. Write-once: the first key to claim an
    // ID whose fingerprint it matches owns it permanently.
    if (req.method === 'POST' && url.pathname === '/v1/keys') {
      const { id, alg, publicKey, encPublicKey, kexAlg } = await readJson(req);
      if (!id || !alg || !publicKey) return send(res, 400, { error: 'Missing id, alg or publicKey.' });
      if ((await fingerprintOf(publicKey)) !== id) {
        return send(res, 400, { error: 'That profile ID is not the fingerprint of that key.' });
      }
      const existing = keys.get(id);
      if (existing && existing.publicKey !== publicKey) {
        return send(res, 409, { error: 'That ID is already registered to a different key.' });
      }
      keys.set(id, { alg, publicKey, encPublicKey, kexAlg, at: Date.now() });
      scheduleSave();
      return send(res, 200, { ok: true });
    }

    // Look up someone's keys so an envelope can be sealed for them.
    if (req.method === 'GET' && url.pathname.startsWith('/v1/keys/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/keys/'.length));
      const record = keys.get(id);
      if (!record) return send(res, 404, { error: 'No such identity here.' });
      return send(res, 200, {
        id,
        alg: record.alg,
        publicKey: record.publicKey,
        encPublicKey: record.encPublicKey,
        kexAlg: record.kexAlg,
      });
    }

    // Challenge-response: prove you hold the key for an ID before reading its
    // mailbox. The nonce is single-use and short-lived.
    if (req.method === 'POST' && url.pathname === '/v1/challenge') {
      const { id } = await readJson(req);
      if (!keys.has(id)) return send(res, 404, { error: 'No such identity here.' });
      const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
      challenges.set(id, { nonce, expires: Date.now() + 60_000 });
      return send(res, 200, { nonce });
    }

    // Post one sealed envelope. The sender signs (to, from, envelope) so the
    // relay can confirm the claimed sender really sent it.
    if (req.method === 'POST' && url.pathname === '/v1/envelopes') {
      const body = await readJson(req);
      const { to, from, envelope, sig } = body;
      if (!to || !from || !envelope || !sig) return send(res, 400, { error: 'Missing to, from, envelope or sig.' });
      if (JSON.stringify(envelope).length > MAX_ENVELOPE_BYTES) {
        return send(res, 413, { error: 'Envelope too large.' });
      }
      if (!keys.has(from)) return send(res, 403, { error: 'Register your key first.' });
      if (!(await verifySignature(from, sig, { to, from, envelope }))) {
        return send(res, 403, { error: 'Signature does not match the sender.' });
      }

      const record = { id: ulid(), to, from, at: Date.now(), envelope, sig };
      const box = mailboxes.get(to) ?? [];
      // A full mailbox drops the oldest rather than rejecting the newest — a
      // recipient who never comes back should not block their friends.
      box.push(record);
      mailboxes.set(to, box.slice(-MAX_MAILBOX));
      scheduleSave();
      deliver(record);
      return send(res, 200, { ok: true, id: record.id });
    }

    // Read your mailbox. Requires a signature over the challenge nonce.
    if (req.method === 'POST' && url.pathname === '/v1/mailbox') {
      const { id, nonce, sig, since } = await readJson(req);
      const challenge = challenges.get(id);
      if (!challenge || challenge.nonce !== nonce || challenge.expires < Date.now()) {
        return send(res, 403, { error: 'Challenge missing or expired.' });
      }
      if (!(await verifySignature(id, sig, { id, nonce }))) {
        return send(res, 403, { error: 'Signature does not match that identity.' });
      }
      challenges.delete(id);
      const box = mailboxes.get(id) ?? [];
      const envelopes = since ? box.filter((e) => e.id > since) : box;
      return send(res, 200, { envelopes });
    }

    // Acknowledge delivery so the relay can forget.
    if (req.method === 'POST' && url.pathname === '/v1/ack') {
      const { id, nonce, sig, ids } = await readJson(req);
      const challenge = challenges.get(id);
      if (!challenge || challenge.nonce !== nonce || challenge.expires < Date.now()) {
        return send(res, 403, { error: 'Challenge missing or expired.' });
      }
      if (!(await verifySignature(id, sig, { id, nonce }))) {
        return send(res, 403, { error: 'Signature does not match that identity.' });
      }
      challenges.delete(id);
      const drop = new Set(ids ?? []);
      const box = (mailboxes.get(id) ?? []).filter((e) => !drop.has(e.id));
      if (box.length) mailboxes.set(id, box);
      else mailboxes.delete(id);
      scheduleSave();
      return send(res, 200, { ok: true, remaining: box.length });
    }

    // Erase everything held for an identity.
    if (req.method === 'POST' && url.pathname === '/v1/forget') {
      const { id, nonce, sig } = await readJson(req);
      const challenge = challenges.get(id);
      if (!challenge || challenge.nonce !== nonce || challenge.expires < Date.now()) {
        return send(res, 403, { error: 'Challenge missing or expired.' });
      }
      if (!(await verifySignature(id, sig, { id, nonce }))) {
        return send(res, 403, { error: 'Signature does not match that identity.' });
      }
      challenges.delete(id);
      mailboxes.delete(id);
      keys.delete(id);
      scheduleSave();
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'No such endpoint.' });
  } catch (e) {
    return send(res, 400, { error: e.message ?? 'Bad request.' });
  }
});

// --- WebSocket --------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/v1/live' });

wss.on('connection', (socket) => {
  let identity = null;
  const timeout = setTimeout(() => {
    if (!identity) socket.close(4001, 'Authentication timed out');
  }, 15_000);

  socket.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    // Two-step auth over the socket: ask for a nonce, then sign it.
    if (msg.type === 'hello' && msg.id) {
      if (!keys.has(msg.id)) return socket.send(JSON.stringify({ type: 'error', error: 'Register your key first.' }));
      const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
      challenges.set(msg.id, { nonce, expires: Date.now() + 60_000 });
      return socket.send(JSON.stringify({ type: 'challenge', nonce }));
    }

    if (msg.type === 'auth' && msg.id && msg.sig) {
      const challenge = challenges.get(msg.id);
      if (!challenge || challenge.nonce !== msg.nonce || challenge.expires < Date.now()) {
        return socket.close(4003, 'Challenge missing or expired');
      }
      if (!(await verifySignature(msg.id, msg.sig, { id: msg.id, nonce: msg.nonce }))) {
        return socket.close(4003, 'Bad signature');
      }
      challenges.delete(msg.id);
      identity = msg.id;
      clearTimeout(timeout);

      const set = live.get(identity) ?? new Set();
      set.add(socket);
      live.set(identity, set);

      socket.send(JSON.stringify({ type: 'ready' }));
      // Hand over anything waiting, so reconnecting is the same code path as
      // being online the whole time.
      for (const envelope of mailboxes.get(identity) ?? []) {
        socket.send(JSON.stringify({ type: 'envelope', envelope }));
      }
    }
  });

  socket.on('close', () => {
    clearTimeout(timeout);
    if (!identity) return;
    const set = live.get(identity);
    set?.delete(socket);
    if (set && set.size === 0) live.delete(identity);
  });
});

await loadData();
server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
  console.log(`[relay] retention ${TTL_MS / 86_400_000} days${DATA_FILE ? `, persisting to ${DATA_FILE}` : ', memory only'}`);
});
