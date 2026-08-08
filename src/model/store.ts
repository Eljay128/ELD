import { useCallback, useSyncExternalStore } from 'react';
import type { AppState, Circle, Order, Peer, Profile } from './types.ts';
import { emptyProfile, newId } from './types.ts';
import { SAMPLE_PEERS } from './samples.ts';
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
        return { me: parsed.me, peers: parsed.peers ?? [], runSelection: parsed.runSelection ?? [] };
      }
    }
  } catch {
    // Corrupt or unreadable storage falls through to a fresh profile rather
    // than leaving the app stuck on a blank screen.
  }
  return { me: emptyProfile(), peers: [], runSelection: [] };
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
  for (const l of listeners) l();
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
export function importPeer(profile: Profile, source: Peer['source'], circle: Circle = 'friends'): ImportResult {
  if (profile.id === state.me.id) {
    return { peer: { profile, circle, importedAt: Date.now(), source }, status: 'self' };
  }
  const existing = state.peers.find((p) => p.profile.id === profile.id);
  const peer: Peer = {
    profile,
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

export function exportBackup(): string {
  return JSON.stringify(state, null, 2);
}

export function importBackup(json: string): void {
  const parsed = JSON.parse(json) as AppState;
  if (!parsed?.me) throw new Error('That file does not contain a Pourfolio backup.');
  set({ me: parsed.me, peers: parsed.peers ?? [], runSelection: [] });
}

export function resetAll(): void {
  set({ me: emptyProfile(), peers: [], runSelection: [] });
}

/** Convenience hook for actions that need the current state at call time. */
export function useActions() {
  return useCallback(() => state, []);
}
