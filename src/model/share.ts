import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Order, Profile, Round } from './types.ts';
import type { DietTag } from '../catalog/types.ts';
import type { KexAlg, SigAlg, Verification } from './identity.ts';
import { verifyOwnership } from './identity.ts';

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
/** Rounds travel under their own prefix so a reader can tell the two apart. */
const ROUNDS_PREFIX = 'PFR1.';

/** Compact on-the-wire shape. Short keys keep QR codes scannable. */
interface WireProfile {
  i: string;
  n: string;
  h?: string;
  e: string;
  /** Profile photo, already downscaled — see model/avatar.ts. */
  g?: string;
  t?: string;
  d?: DietTag[];
  a?: string;
  x?: string[];
  o: WireOrder[];
  v: number;
  u: number;
  /** Identity — see model/identity.ts. Excluded from the signed payload. */
  pk?: string;
  sa?: SigAlg;
  sg?: string;
  sv?: number;
  ek?: string;
  ka?: KexAlg;
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
    ...(p.avatar ? { g: p.avatar } : {}),
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
    ...(p.publicKey ? { pk: p.publicKey } : {}),
    ...(p.sigAlg ? { sa: p.sigAlg } : {}),
    ...(p.signature ? { sg: p.signature } : {}),
    ...(p.sigVersion !== undefined ? { sv: p.sigVersion } : {}),
    ...(p.encPublicKey ? { ek: p.encPublicKey } : {}),
    ...(p.kexAlg ? { ka: p.kexAlg } : {}),
  };
}

/**
 * Exactly the bytes a signature covers: the whole wire profile minus the
 * signature fields themselves. Both signer and verifier build this the same
 * way, and `canonical()` sorts keys so serialisation order cannot diverge.
 */
export function signedProfilePayload(p: Profile): object {
  const { pk: _pk, sa: _sa, sg: _sg, sv: _sv, ...rest } = toWire(p);
  // `ek`/`ka` stay in the signed payload on purpose: a peer's encryption key
  // must be as tamper-evident as the rest of their profile.
  return rest;
}

/** Verify a decoded profile against the key it carries. */
export function verifyProfile(p: Profile): Promise<Verification> {
  return verifyOwnership(signedProfilePayload(p), p.signature, p.publicKey, p.sigAlg, p.id);
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
    avatar: w.g,
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
    publicKey: w.pk,
    sigAlg: w.sa,
    signature: w.sg,
    sigVersion: w.sv,
    encPublicKey: w.ek,
    kexAlg: w.ka,
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

/**
 * Encode without the photo. A profile carrying an image is several kilobytes,
 * which is fine for a link but past what a QR code can hold — so the UI can
 * offer a slimmed version rather than silently failing to render a QR.
 */
export function encodeProfileSlim(profile: Profile): string {
  const { avatar: _omitted, ...rest } = profile;
  return encodeProfile(rest);
}

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

// --- rounds -----------------------------------------------------------------

interface WireRound {
  i: string;
  a: number;
  b: string;
  bn: string;
  be: string;
  r: { i: string; n: string; e: string; d: string; b: string; be: string }[];
  o?: string;
  m?: string;
  pk?: string;
  sa?: SigAlg;
  sg?: string;
}

/**
 * Rounds are shared separately from profiles. A profile is who you are; a round
 * is something that happened. Keeping them apart means a profile code stays
 * small and stable no matter how much activity accumulates.
 */
export function encodeRounds(rounds: Round[]): string {
  const wire: WireRound[] = rounds.map((r) => ({
    i: r.id,
    a: r.at,
    b: r.buyerId,
    bn: r.buyerName,
    be: r.buyerEmoji,
    r: r.recipients.map((x) => ({ i: x.id, n: x.name, e: x.emoji, d: x.drink, b: x.brand, be: x.brandEmoji })),
    ...(r.occasion ? { o: r.occasion } : {}),
    ...(r.note ? { m: r.note } : {}),
    ...(r.publicKey ? { pk: r.publicKey } : {}),
    ...(r.sigAlg ? { sa: r.sigAlg } : {}),
    ...(r.signature ? { sg: r.signature } : {}),
  }));
  const packed = deflateSync(strToU8(JSON.stringify(wire)), { level: 9 });
  return ROUNDS_PREFIX + bytesToB64url(packed);
}

export function decodeRounds(code: string): Round[] {
  const match = /PFR1\.[A-Za-z0-9_-]+/.exec(code.trim());
  if (!match) throw new ShareCodeError('No Pourfolio activity code found in that text.');
  let wire: WireRound[];
  try {
    const bytes = b64urlToBytes(match[0].slice(ROUNDS_PREFIX.length));
    wire = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    throw new ShareCodeError('That activity code is damaged or incomplete.');
  }
  if (!Array.isArray(wire)) throw new ShareCodeError('That code is not a Pourfolio activity list.');
  return wire.map((r) => ({
    id: r.i,
    at: r.a,
    buyerId: r.b,
    buyerName: r.bn,
    buyerEmoji: r.be || '\u2615',
    recipients: (r.r ?? []).map((x) => ({ id: x.i, name: x.n, emoji: x.e, drink: x.d, brand: x.b, brandEmoji: x.be })),
    occasion: r.o,
    note: r.m,
    publicKey: r.pk,
    sigAlg: r.sa,
    signature: r.sg,
    source: 'peer' as const,
  }));
}

export function isRoundsCode(text: string): boolean {
  return /PFR1\.[A-Za-z0-9_-]+/.test(text);
}

/**
 * The bytes a round's signature covers. Mirrors `signedProfilePayload`: the
 * wire form minus the signature fields, canonicalised by the verifier.
 */
export function signedRoundPayload(r: Round): object {
  const {
    signature: _sig,
    publicKey: _pk,
    sigAlg: _alg,
    verification: _v,
    source: _s,
    ...rest
  } = r;
  return rest;
}

export function verifyRound(r: Round): Promise<Verification> {
  return verifyOwnership(signedRoundPayload(r), r.signature, r.publicKey, r.sigAlg, r.buyerId);
}
