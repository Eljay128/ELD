import type { Peer, Profile, Round } from './types.ts';
import type { Identity } from './identity.ts';
import { currentIdentity, signValue } from './identity.ts';
import { seal, unseal, type SealedEnvelope } from './sealed.ts';
import { verifyRound } from './share.ts';
import { currentState, mayPostRounds, receiveRounds } from './store.ts';

/**
 * The optional relay client.
 *
 * **Off by default, and pointing nowhere.** Nothing in this module runs until a
 * member enters a relay URL and switches it on. With it off the app behaves
 * exactly as it did before: no network calls, no identity published anywhere.
 *
 * When it is on, this is what makes the feed genuinely always-on — a round
 * reaches someone whose app was closed, because the relay held the sealed
 * envelope until they came back.
 *
 * The relay only ever sees ciphertext plus routing metadata (who, to whom,
 * when). Everything readable is sealed for one recipient before it leaves.
 */

const SETTINGS_KEY = 'pourfolio.relay.v1';

export interface RelaySettings {
  enabled: boolean;
  url: string;
  /** Ids already delivered, so a reconnect does not replay the whole mailbox. */
  cursor?: string;
}

export type RelayStatus =
  | 'off'
  | 'connecting'
  | 'registering'
  | 'online'
  | 'offline'
  | 'error';

export interface RelayState {
  status: RelayStatus;
  detail?: string;
  /** Envelopes accepted since connecting — a visible sign it is working. */
  received: number;
  sent: number;
  lastEventAt?: number;
}

let settings: RelaySettings = loadSettings();
let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let attempts = 0;
let state: RelayState = { status: 'off', received: 0, sent: 0 };
const listeners = new Set<() => void>();

function loadSettings(): RelaySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RelaySettings;
      // A stored `enabled` is honoured, but never a default — a fresh install
      // is always off.
      return { enabled: !!parsed.enabled, url: parsed.url ?? '', cursor: parsed.cursor };
    }
  } catch {
    // Fall through to the safe default.
  }
  return { enabled: false, url: '' };
}

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not fatal — the relay just will not be remembered next launch.
  }
}

function setState(patch: Partial<RelayState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribeRelay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function relayState(): RelayState {
  return state;
}

export function relaySettings(): RelaySettings {
  return settings;
}

// --- HTTP helpers -----------------------------------------------------------

function httpBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function wsUrl(url: string): string {
  return httpBase(url).replace(/^http/, 'ws') + '/v1/live';
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(httpBase(settings.url) + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Relay returned ${res.status}`);
  return json as T;
}

/** Prove control of the identity: server nonce, signed. */
async function authenticate(identity: Identity, id: string): Promise<{ nonce: string; sig: string }> {
  const { nonce } = await post<{ nonce: string }>('/v1/challenge', { id });
  const sig = await signValue({ id, nonce }, identity);
  return { nonce, sig };
}

// --- public API -------------------------------------------------------------

export async function checkRelay(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(httpBase(url) + '/v1/health');
    if (!res.ok) return { ok: false, detail: `Relay answered ${res.status}.` };
    const health = (await res.json()) as { service?: string; retentionDays?: number };
    if (health.service !== 'pourfolio-relay') return { ok: false, detail: 'That is not a Pourfolio relay.' };
    return { ok: true, detail: `Reachable. Holds undelivered rounds for ${health.retentionDays ?? '?'} days.` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'Could not reach that address.' };
  }
}

export async function enableRelay(url: string): Promise<void> {
  settings = { ...settings, enabled: true, url };
  saveSettings();
  await connect();
}

export function disableRelay(): void {
  settings = { ...settings, enabled: false };
  saveSettings();
  window.clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
  setState({ status: 'off', detail: undefined });
}

/** Remove everything the relay holds for this identity, then switch off. */
export async function forgetMeOnRelay(): Promise<void> {
  const identity = currentIdentity();
  const me = currentState().me;
  if (!identity || !settings.url) return;
  const { nonce, sig } = await authenticate(identity, me.id);
  await post('/v1/forget', { id: me.id, nonce, sig });
  disableRelay();
}

/** Publish the public keys so peers can find and seal for this identity. */
async function register(identity: Identity, me: Profile): Promise<void> {
  setState({ status: 'registering' });
  await post('/v1/keys', {
    id: me.id,
    alg: identity.alg,
    publicKey: identity.publicKey,
    encPublicKey: identity.encPublicKey,
    kexAlg: identity.kexAlg,
  });
}

export async function connect(): Promise<void> {
  const identity = currentIdentity();
  const me = currentState().me;
  if (!settings.enabled || !settings.url || !identity) return;
  if (me.id !== identity.fingerprint) {
    setState({
      status: 'error',
      detail:
        'This profile predates its key, so the relay cannot confirm the ID belongs to you. Start a fresh profile to use a relay.',
    });
    return;
  }

  window.clearTimeout(reconnectTimer);
  setState({ status: 'connecting', detail: undefined });

  try {
    await register(identity, me);
    await catchUp(identity, me.id);
    openSocket(identity, me.id);
  } catch (e) {
    setState({ status: 'error', detail: e instanceof Error ? e.message : 'Could not reach the relay.' });
    scheduleReconnect();
  }
}

/** Fetch anything that arrived while this device was away. */
async function catchUp(identity: Identity, id: string): Promise<void> {
  const { nonce, sig } = await authenticate(identity, id);
  const { envelopes } = await post<{ envelopes: RelayRecord[] }>('/v1/mailbox', {
    id,
    nonce,
    sig,
    since: settings.cursor,
  });
  if (!envelopes?.length) return;

  const accepted = await ingest(envelopes, identity);
  const newest = envelopes[envelopes.length - 1]?.id;
  if (newest) {
    settings = { ...settings, cursor: newest };
    saveSettings();
  }

  // Acknowledge so the relay can forget them.
  const ack = await authenticate(identity, id);
  await post('/v1/ack', { id, nonce: ack.nonce, sig: ack.sig, ids: envelopes.map((e) => e.id) });
  if (accepted) setState({ received: state.received + accepted, lastEventAt: Date.now() });
}

interface RelayRecord {
  id: string;
  to: string;
  from: string;
  at: number;
  envelope: SealedEnvelope;
}

/**
 * Open, check and merge inbound envelopes.
 *
 * Three gates, in order: the envelope must decrypt (so it was really sealed for
 * us), the round inside must carry a valid signature from the claimed buyer,
 * and that buyer must be someone we have imported and not muted. A round is a
 * claim about the reader, so unsolicited ones are dropped rather than shown.
 */
async function ingest(records: RelayRecord[], identity: Identity): Promise<number> {
  const rounds: Round[] = [];
  for (const record of records) {
    try {
      const round = await unseal<Round>(record.envelope, identity);
      if (round.buyerId !== record.from) continue;
      if (!mayPostRounds(round.buyerId)) continue;
      if ((await verifyRound(round)) === 'invalid') continue;
      rounds.push({ ...round, source: 'peer' });
    } catch {
      // A single unreadable envelope must not stop the rest of the mailbox.
    }
  }
  return rounds.length ? await receiveRounds(rounds) : 0;
}

function openSocket(identity: Identity, id: string): void {
  socket?.close();
  const ws = new WebSocket(wsUrl(settings.url));
  socket = ws;

  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id }));

  ws.onmessage = async (event) => {
    let msg: { type: string; nonce?: string; envelope?: RelayRecord; error?: string };
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (msg.type === 'challenge' && msg.nonce) {
      const sig = await signValue({ id, nonce: msg.nonce }, identity);
      ws.send(JSON.stringify({ type: 'auth', id, nonce: msg.nonce, sig }));
      return;
    }
    if (msg.type === 'ready') {
      attempts = 0;
      setState({ status: 'online', detail: undefined });
      return;
    }
    if (msg.type === 'error') {
      setState({ status: 'error', detail: msg.error });
      return;
    }
    if (msg.type === 'envelope' && msg.envelope) {
      const accepted = await ingest([msg.envelope], identity);
      if (accepted) setState({ received: state.received + accepted, lastEventAt: Date.now() });
    }
  };

  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (!settings.enabled) return;
    setState({ status: 'offline' });
    scheduleReconnect();
  };

  ws.onerror = () => setState({ status: 'offline' });
}

function scheduleReconnect(): void {
  if (!settings.enabled) return;
  attempts = Math.min(attempts + 1, 6);
  const delay = Math.min(30_000, 1000 * 2 ** attempts);
  window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => void connect(), delay);
}

/**
 * Send a round to every recipient who can receive it.
 *
 * One sealed envelope per recipient — there is no group key, so the relay
 * cannot learn that two envelopes hold the same round. Recipients without a
 * published encryption key are skipped rather than sent something readable.
 */
export async function publishRound(round: Round): Promise<number> {
  const identity = currentIdentity();
  if (!settings.enabled || !settings.url || !identity || state.status === 'error') return 0;

  const { peers, me } = currentState();
  const targets = round.recipients
    .filter((r) => r.id !== me.id)
    .map((r) => peers.find((p: Peer) => p.profile.id === r.id))
    .filter((p): p is Peer => !!p && !!p.profile.encPublicKey && !!p.profile.kexAlg);

  let sent = 0;
  for (const peer of targets) {
    try {
      const envelope = await seal(round, identity, peer.profile.encPublicKey!, peer.profile.kexAlg!);
      const sig = await signValue({ to: peer.profile.id, from: me.id, envelope }, identity);
      await post('/v1/envelopes', { to: peer.profile.id, from: me.id, envelope, sig });
      sent++;
    } catch {
      // One unreachable recipient should not abort the rest of the round.
    }
  }
  if (sent) setState({ sent: state.sent + sent, lastEventAt: Date.now() });
  return sent;
}

/** Reconnect on boot if the member previously switched the relay on. */
export function resumeRelay(): void {
  if (settings.enabled && settings.url) void connect();
}
