import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Order, Profile } from './types.ts';
import type { DietTag } from '../catalog/types.ts';

/**
 * Share encoding.
 *
 * A profile is packed into short-keyed JSON, deflated, then base64url-encoded.
 * The result is a self-contained string — no server, no lookup, no account.
 * It travels equally well as a link fragment, a pasted code, a QR code, or a
 * `.pourfolio` file.
 *
 * The `PF1.` prefix is a format version. Future formats bump the number so an
 * older build can say "this code is newer than me" instead of failing oddly.
 */

const PREFIX = 'PF1.';

/** Compact on-the-wire shape. Short keys keep QR codes scannable. */
interface WireProfile {
  i: string;
  n: string;
  h?: string;
  e: string;
  t?: string;
  d?: DietTag[];
  a?: string;
  x?: string[];
  o: WireOrder[];
  v: number;
  u: number;
}

interface WireOrder {
  i: string;
  b: string;
  k: string;
  p: Order['daypart'];
  c: Order['occasions'];
  s: Order['choices'];
  f?: 1;
  m?: string;
  ca: number;
  ua: number;
}

function toWire(p: Profile): WireProfile {
  return {
    i: p.id,
    n: p.name,
    ...(p.handle ? { h: p.handle } : {}),
    e: p.emoji,
    ...(p.tagline ? { t: p.tagline } : {}),
    ...(p.diet.length ? { d: p.diet } : {}),
    ...(p.allergyNote ? { a: p.allergyNote } : {}),
    ...(p.dislikes.length ? { x: p.dislikes } : {}),
    o: p.orders.map((o) => ({
      i: o.id,
      b: o.brandId,
      k: o.drinkId,
      p: o.daypart,
      c: o.occasions,
      s: pruneChoices(o.choices),
      ...(o.favorite ? { f: 1 as const } : {}),
      ...(o.note ? { m: o.note } : {}),
      ca: o.createdAt,
      ua: o.updatedAt,
    })),
    v: p.version,
    u: p.updatedAt,
  };
}

/** Drop empty selections so they do not bloat the code. */
function pruneChoices(choices: Order['choices']): Order['choices'] {
  const out: Order['choices'] = {};
  for (const [k, v] of Object.entries(choices)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function fromWire(w: WireProfile): Profile {
  return {
    id: w.i,
    name: w.n,
    handle: w.h,
    emoji: w.e || '☕',
    tagline: w.t,
    diet: w.d ?? [],
    allergyNote: w.a,
    dislikes: w.x ?? [],
    orders: (w.o ?? []).map((o) => ({
      id: o.i,
      brandId: o.b,
      drinkId: o.k,
      daypart: o.p,
      occasions: o.c ?? [],
      choices: o.s ?? {},
      favorite: o.f === 1,
      note: o.m,
      createdAt: o.ca ?? Date.now(),
      updatedAt: o.ua ?? Date.now(),
    })),
    version: w.v ?? 1,
    updatedAt: w.u ?? Date.now(),
  };
}

// --- base64url (no padding) -------------------------------------------------

function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// --- public API -------------------------------------------------------------

export function encodeProfile(profile: Profile): string {
  const json = JSON.stringify(toWire(profile));
  const packed = deflateSync(strToU8(json), { level: 9 });
  return PREFIX + bytesToB64url(packed);
}

export class ShareCodeError extends Error {}

export function decodeProfile(code: string): Profile {
  const trimmed = extractCode(code);
  if (!trimmed) throw new ShareCodeError('No Pourfolio code found in that text.');
  if (!trimmed.startsWith(PREFIX)) {
    const version = /^PF(\d+)\./.exec(trimmed)?.[1];
    throw new ShareCodeError(
      version
        ? `That code uses share format v${version}; this app reads v1. Ask them to re-share, or update the app.`
        : 'That does not look like a Pourfolio share code.',
    );
  }
  let wire: WireProfile;
  try {
    const bytes = b64urlToBytes(trimmed.slice(PREFIX.length));
    wire = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    throw new ShareCodeError('That code is damaged or incomplete — try copying it again.');
  }
  if (!wire || typeof wire !== 'object' || typeof wire.i !== 'string' || !Array.isArray(wire.o)) {
    throw new ShareCodeError('That code decoded, but it is not a beverage profile.');
  }
  return fromWire(wire);
}

/**
 * Pull a share code out of whatever the user pasted — a bare code, a full share
 * link, or a code buried in a sentence from a chat app.
 */
export function extractCode(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const match = /PF\d+\.[A-Za-z0-9_-]+/.exec(text);
  return match ? match[0] : null;
}

/** A link that opens this app with the profile pre-loaded. */
export function shareLink(profile: Profile, origin?: string): string {
  const base = origin ?? (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return `${base}#add=${encodeProfile(profile)}`;
}

/** Read an inbound profile from the URL fragment, if there is one. */
export function readInboundCode(): string | null {
  if (typeof location === 'undefined') return null;
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const add = params.get('add');
  if (add) return add;
  return extractCode(hash);
}

export function clearInbound(): void {
  if (typeof history !== 'undefined') {
    history.replaceState(null, '', location.pathname + location.search);
  }
}
