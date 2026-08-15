import { useCallback, useSyncExternalStore } from 'react';
import type { AppState, Circle, Order, Peer, Profile, Round } from './types.ts';
import { emptyProfile, newId } from './types.ts';
import { SAMPLE_PEERS, sampleRounds } from './samples.ts';
import type { Identity, Verification } from './identity.ts';
import { adoptIdentity, currentIdentity, ensureKexKey, exportIdentity, loadIdentity, signValue } from './identity.ts';
import { signedProfilePayload, signedRoundPayload, verifyProfile, verifyRound } from './share.ts';
import type { Daypart } from '../catalog/types.ts';
import { groupsForDrink } from '../catalog/index.ts';

/**
 * State lives in localStorage and nowhere else. There is no account, no sync
 * server and no telemetry — a member's profile and everyone they have imported
 * stay on their own device until they choose to hand a code to someone.
 */

const KEY = 'pourfolio.v1';

let state: AppState = load();
const listeners = new Set<() => void>();

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed?.me) {
        return {
          me: parsed.me,
          peers: parsed.peers ?? [],
          runSelection: parsed.runSelection ?? [],
          rounds: parsed.rounds ?? [],
        };
      }
    }
  } catch {
    // Corrupt or unreadable storage falls through to a fresh profile rather
    // than leaving the app stuck on a blank screen.
  }
  return { me: emptyProfile(), peers: [], runSelection: [], rounds: [] };
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Out of quota or storage blocked (private mode). The session still works;
    // it just will not survive a reload, which is better than throwing.
  }
}

function set(next: AppState): void {
  state = next;
  persist();
  emit();
}

function emit(): void {
  for (const l of listeners) l();
}

/**
 * Live updates between windows.
 *
 * The `storage` event fires in *other* tabs of the same origin whenever this
 * one writes, so two windows — or a laptop with the app open twice — stay in
 * step with no server and no polling. This is the honest extent of "real time"
 * for an app with no backend: instant within a device, and instant to a peer
 * while a direct connection is open.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || e.newValue === null) return;
    try {
      const parsed = JSON.parse(e.newValue) as AppState;
      if (!parsed?.me) return;
      state = {
        me: parsed.me,
        peers: parsed.peers ?? [],
        runSelection: parsed.runSelection ?? [],
        rounds: parsed.rounds ?? [],
      };
      emit();
    } catch {
      // A half-written or foreign value is ignored rather than crashing the tab.
    }
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): AppState {
  return state;
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Mark the profile changed so peers can tell whose copy is newer. */
function touch(me: Profile): Profile {
  return { ...me, version: me.version + 1, updatedAt: Date.now() };
}

// --- profile ---------------------------------------------------------------

export function updateMe(patch: Partial<Profile>): void {
  set({ ...state, me: touch({ ...state.me, ...patch }) });
}

export function replaceMe(profile: Profile): void {
  set({ ...state, me: profile });
}

// --- orders ----------------------------------------------------------------

/** Start an order with every group's declared default already filled in. */
export function draftOrder(brandId: string, drinkId: string, daypart: Daypart): Order {
  const choices: Order['choices'] = {};
  for (const group of groupsForDrink(brandId, drinkId)) {
    if (group.fallback !== undefined) choices[group.id] = group.fallback;
  }
  const now = Date.now();
  return {
    id: newId(),
    brandId,
    drinkId,
    daypart,
    occasions: ['everyday'],
    choices,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveOrder(order: Order): void {
  const orders = [...state.me.orders];
  const at = orders.findIndex((o) => o.id === order.id);
  const stamped = { ...order, updatedAt: Date.now() };
  if (at >= 0) orders[at] = stamped;
  else orders.push(stamped);
  set({ ...state, me: touch({ ...state.me, orders }) });
}

export function deleteOrder(id: string): void {
  set({ ...state, me: touch({ ...state.me, orders: state.me.orders.filter((o) => o.id !== id) }) });
}

export function duplicateOrder(id: string): Order | null {
  const original = state.me.orders.find((o) => o.id === id);
  if (!original) return null;
  const copy: Order = { ...original, id: newId(), favorite: false, createdAt: Date.now(), updatedAt: Date.now() };
  saveOrder(copy);
  return copy;
}

/** Only one favourite per daypart — it is "the" go-to order for that slot. */
export function toggleFavorite(id: string): void {
  const target = state.me.orders.find((o) => o.id === id);
  if (!target) return;
  const makingFavorite = !target.favorite;
  const orders = state.me.orders.map((o) => {
    if (o.id === id) return { ...o, favorite: makingFavorite, updatedAt: Date.now() };
    if (makingFavorite && o.daypart === target.daypart && o.favorite) return { ...o, favorite: false };
    return o;
  });
  set({ ...state, me: touch({ ...state.me, orders }) });
}

// --- peers -----------------------------------------------------------------

export interface ImportResult {
  peer: Peer;
  status: 'added' | 'updated' | 'unchanged' | 'self';
}

/**
 * Import a decoded profile. Re-importing someone replaces the stored copy when
 * the incoming one is newer, so passing the same link around twice is safe.
 */
export function importPeer(
  profile: Profile,
  source: Peer['source'],
  circle: Circle = 'friends',
  verification: Verification = 'legacy',
): ImportResult {
  if (profile.id === state.me.id) {
    return { peer: { profile, verification, circle, importedAt: Date.now(), source }, status: 'self' };
  }
  const existing = state.peers.find((p) => p.profile.id === profile.id);
  const peer: Peer = {
    profile,
    verification,
    circle: existing?.circle ?? circle,
    importedAt: Date.now(),
    source,
  };
  if (!existing) {
    set({ ...state, peers: [...state.peers, peer] });
    return { peer, status: 'added' };
  }
  const incomingIsNewer =
    profile.version > existing.profile.version ||
    (profile.version === existing.profile.version && profile.updatedAt > existing.profile.updatedAt);
  if (!incomingIsNewer) return { peer: existing, status: 'unchanged' };
  set({ ...state, peers: state.peers.map((p) => (p.profile.id === profile.id ? peer : p)) });
  return { peer, status: 'updated' };
}

/**
 * Import and check the signature in one step. Verification is asynchronous
 * (WebCrypto is), so this is the entry point every real import path uses; the
 * synchronous `importPeer` remains for the sample data, which is unsigned by
 * design and honestly labelled as such.
 */
export async function importPeerVerified(
  profile: Profile,
  source: Peer['source'],
  circle: Circle = 'friends',
): Promise<ImportResult> {
  const verification = await verifyProfile(profile);
  return importPeer(profile, source, circle, verification);
}

/**
 * Bring in the built-in example people. They arrive through the ordinary import
 * path, so they behave exactly like anyone a real peer has shared.
 */
export function loadSamplePeers(): number {
  const circles: Circle[] = ['friends', 'coworkers', 'family'];
  let added = 0;
  for (const [i, profile] of SAMPLE_PEERS.entries()) {
    const { status } = importPeer(structuredClone(profile), 'sample', circles[i] ?? 'other');
    if (status === 'added' || status === 'updated') added++;
  }
  receiveRoundsUnchecked(sampleRounds());
  return added;
}

export function removePeer(id: string): void {
  set({
    ...state,
    peers: state.peers.filter((p) => p.profile.id !== id),
    runSelection: state.runSelection.filter((p) => p !== id),
  });
}

export function setPeerCircle(id: string, circle: Circle): void {
  set({ ...state, peers: state.peers.map((p) => (p.profile.id === id ? { ...p, circle } : p)) });
}

/** Revoke or restore a peer's ability to put rounds on your feed. */
export function setPeerAllowRounds(id: string, allow: boolean): void {
  set({ ...state, peers: state.peers.map((p) => (p.profile.id === id ? { ...p, allowRounds: allow } : p)) });
}

/** Consent check used before any inbound round is accepted. */
export function mayPostRounds(profileId: string): boolean {
  if (profileId === state.me.id) return true;
  const peer = state.peers.find((p) => p.profile.id === profileId);
  // Mutual import is the consent signal: someone you have never imported
  // cannot put a claim about you on your own feed.
  return !!peer && peer.allowRounds !== false;
}

export function currentState(): AppState {
  return state;
}

// --- coffee run ------------------------------------------------------------

export function toggleRunSelection(id: string): void {
  const has = state.runSelection.includes(id);
  set({
    ...state,
    runSelection: has ? state.runSelection.filter((p) => p !== id) : [...state.runSelection, id],
  });
}

export function clearRunSelection(): void {
  set({ ...state, runSelection: [] });
}

export function selectAllForRun(ids: string[]): void {
  set({ ...state, runSelection: ids });
}

// --- whole-store operations ------------------------------------------------

/**
 * The backup now carries the private key. Without it a restored profile keeps
 * its drinks but loses the ability to prove it is itself — so the export is the
 * only route between devices, and the UI says so.
 */
export function exportBackup(): string {
  return JSON.stringify({ ...state, identity: identitySnapshot() }, null, 2);
}

export async function importBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json) as AppState & { identity?: Identity };
  if (!parsed?.me) throw new Error('That file does not contain a Pourfolio backup.');
  if (parsed.identity?.privateJwk) await adoptIdentity(parsed.identity);
  set({ me: parsed.me, peers: parsed.peers ?? [], runSelection: [], rounds: parsed.rounds ?? [] });
  await ensureSigned();
}

export function resetAll(): void {
  set({ me: emptyProfile(), peers: [], runSelection: [], rounds: [] });
}

// --- identity ---------------------------------------------------------------

/**
 * Boot the identity and make sure the profile carries a current signature.
 *
 * A profile is re-signed whenever its `version` moves past `sigVersion`, which
 * every mutation bumps — so the signature can never quietly describe stale
 * content. Existing profiles keep their original id and simply gain a key,
 * which leaves them "unconfirmed" rather than breaking every share link already
 * in circulation.
 */
export async function initIdentity(): Promise<Identity> {
  await loadIdentity();
  // Identities predating encryption gain a key-agreement pair in place, so the
  // fingerprint — and therefore the profile ID — never changes.
  const identity = (await ensureKexKey()) ?? currentIdentity()!;
  adoptFingerprintIfPristine(identity);
  await ensureSigned();
  return identity;
}

/**
 * A profile that has never been used adopts the key's fingerprint as its id, so
 * anyone starting today is fully verifiable. An established profile keeps the
 * id it already has: changing it would break every share link already sent, and
 * "Unconfirmed ID" is the honest description of that trade rather than a bug.
 */
function adoptFingerprintIfPristine(identity: Identity): void {
  const me = state.me;
  const pristine = me.version === 1 && !me.name.trim() && me.orders.length === 0 && !me.signature;
  if (!pristine || me.id === identity.fingerprint) return;
  state = { ...state, me: { ...me, id: identity.fingerprint } };
  persist();
  emit();
}

/** Re-sign the profile if the stored signature is out of date. Safe to call often. */
export async function ensureSigned(): Promise<void> {
  const identity = currentIdentity();
  if (!identity) return;
  const me = state.me;
  const fresh =
    me.sigVersion === me.version &&
    me.publicKey === identity.publicKey &&
    me.encPublicKey === identity.encPublicKey &&
    !!me.signature;
  if (fresh) return;

  const candidate: Profile = {
    ...me,
    publicKey: identity.publicKey,
    sigAlg: identity.alg,
    encPublicKey: identity.encPublicKey,
    kexAlg: identity.kexAlg,
    sigVersion: me.version,
  };
  const signature = await signValue(signedProfilePayload(candidate), identity);

  // Signing is not an edit, so it must not bump the version — that would
  // invalidate the signature it just produced and loop forever.
  state = { ...state, me: { ...candidate, signature } };
  persist();
  emit();
}

/** Sign a round as its buyer before it is stored or sent. */
export async function signRound(round: Round): Promise<Round> {
  const identity = currentIdentity();
  if (!identity || round.buyerId !== state.me.id) return round;
  const candidate: Round = { ...round, publicKey: identity.publicKey, sigAlg: identity.alg };
  const signature = await signValue(signedRoundPayload(candidate), identity);
  return { ...candidate, signature, verification: 'verified' };
}

export function identitySnapshot(): Identity | null {
  return exportIdentity();
}

// --- rounds ----------------------------------------------------------------

/** Newest first, and de-duplicated by id so a re-import cannot double up. */
function mergeRounds(existing: Round[], incoming: Round[]): Round[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const round of incoming) {
    if (!byId.has(round.id)) byId.set(round.id, round);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
}

export async function addRound(round: Round): Promise<void> {
  const signed = await signRound(round);
  set({ ...state, rounds: mergeRounds(state.rounds, [signed]) });
  // Local state is authoritative and already updated; the relay is a
  // best-effort delivery attempt on top, imported lazily so the module never
  // loads for members who leave the relay switched off.
  if (signed.buyerId === state.me.id) {
    void import('./relay.ts').then((m) => m.publishRound(signed)).catch(() => {});
  }
}

/**
 * Merge rounds that arrived from elsewhere, checking each signature first.
 * Returns how many were genuinely new.
 */
export async function receiveRounds(rounds: Round[]): Promise<number> {
  const checked = await Promise.all(
    rounds.map(async (r) => ({ ...r, verification: r.signature ? await verifyRound(r) : ('legacy' as const) })),
  );
  const before = state.rounds.length;
  const merged = mergeRounds(state.rounds, checked);
  if (merged.length === before) return 0;
  set({ ...state, rounds: merged });
  return merged.length - before;
}

/** Sample activity is unsigned on purpose and skips the verification round-trip. */
function receiveRoundsUnchecked(rounds: Round[]): number {
  const before = state.rounds.length;
  const merged = mergeRounds(state.rounds, rounds);
  if (merged.length === before) return 0;
  set({ ...state, rounds: merged });
  return merged.length - before;
}

export function deleteRound(id: string): void {
  set({ ...state, rounds: state.rounds.filter((r) => r.id !== id) });
}

export function clearRounds(): void {
  set({ ...state, rounds: [] });
}

export function loadSampleRounds(): number {
  return receiveRoundsUnchecked(sampleRounds());
}

/** Convenience hook for actions that need the current state at call time. */
export function useActions() {
  return useCallback(() => state, []);
}
