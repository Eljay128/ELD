/**
 * Cryptographic identity.
 *
 * Until now a `Profile.id` was a random string the client made up. That is
 * sound while profiles only ever arrive from someone who physically handed one
 * over — but the moment anything accepts profiles or rounds at a distance, a
 * self-asserted id is forgeable. Anyone could publish a round claiming you
 * bought the office a tray of tequila.
 *
 * So an identity is a keypair generated on this device and never sent anywhere,
 * and a *new* profile's id is the fingerprint of its own public key. That makes
 * the id unclaimable: to sign as `a1b2c3…` you must hold the key that hashes to
 * `a1b2c3…`. Every profile and every round carries a signature, and both the
 * sender and the receiver check it — so this holds even against a relay that
 * has been compromised.
 *
 * This module is deliberately standalone and needs no server. It makes the
 * existing peer-to-peer paths spoof-resistant on its own.
 */

const STORAGE_KEY = 'pourfolio.identity.v1';

/**
 * Ed25519 is the better choice and is the one we ask for first. WebCrypto
 * support for it arrived late, so ECDSA P-256 — available essentially
 * everywhere — is the fallback. The algorithm is recorded alongside the key so
 * verification always knows which one produced a given signature.
 */
export type SigAlg = 'Ed25519' | 'ECDSA-P256';

export interface Identity {
  alg: SigAlg;
  /** base64url of the raw public key. Travels inside share codes. */
  publicKey: string;
  /** Fingerprint of `publicKey`. New profiles adopt this as their id. */
  fingerprint: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  createdAt: number;
}

/** How much a decoded profile or round can be trusted. */
export type Verification =
  /** Signed, signature checks out, and the id is the key's fingerprint. */
  | 'verified'
  /** Made before identities existed. Not suspicious, just unprovable. */
  | 'legacy'
  /** Signed and the signature is valid, but the id is not this key's
   *  fingerprint — an older profile that adopted a key without changing id. */
  | 'unverified'
  /** A signature was present and did NOT check out. Treat as hostile. */
  | 'invalid';

// --- algorithm plumbing -----------------------------------------------------

function signParams(alg: SigAlg): AlgorithmIdentifier | EcdsaParams {
  return alg === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
}

function keyParams(alg: SigAlg): AlgorithmIdentifier | EcKeyImportParams {
  return alg === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
}

async function supportsEd25519(): Promise<boolean> {
  try {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    return !!pair.privateKey;
  } catch {
    return false;
  }
}

// --- base64url --------------------------------------------------------------

export function toB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// --- canonical bytes --------------------------------------------------------

/**
 * Both sides must hash exactly the same bytes, so object key order cannot be
 * left to whoever built the object. Keys are sorted at every level.
 */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** 16 base64url characters of SHA-256 — 96 bits, ample against collision here. */
export async function fingerprintOf(publicKeyB64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', fromB64url(publicKeyB64) as BufferSource);
  return toB64url(digest).slice(0, 16);
}

// --- identity lifecycle -----------------------------------------------------

let cached: Identity | null = null;

/** Load the stored identity, creating one on first run. Call once at boot. */
export async function loadIdentity(): Promise<Identity> {
  if (cached) return cached;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Identity;
      if (parsed?.privateJwk && parsed?.publicKey && parsed?.fingerprint) {
        cached = parsed;
        return cached;
      }
    }
  } catch {
    // Unreadable storage falls through to generating a fresh identity. That
    // costs the old id, which is bad — but far better than failing to boot.
  }

  cached = await createIdentity();
  persist(cached);
  return cached;
}

export async function createIdentity(): Promise<Identity> {
  const alg: SigAlg = (await supportsEd25519()) ? 'Ed25519' : 'ECDSA-P256';
  const pair = (await crypto.subtle.generateKey(keyParams(alg) as AlgorithmIdentifier, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  const rawPublic = await crypto.subtle.exportKey('raw', pair.publicKey);
  const publicKey = toB64url(rawPublic);

  return {
    alg,
    publicKey,
    fingerprint: await fingerprintOf(publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    createdAt: Date.now(),
  };
}

function persist(identity: Identity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Private mode or a full quota. The session still signs correctly; the
    // identity simply will not survive a reload, which the UI can surface.
  }
}

/** Synchronous read for code paths that run after boot. */
export function currentIdentity(): Identity | null {
  return cached;
}

/** Replace the identity — used when restoring a backup from another device. */
export async function adoptIdentity(identity: Identity): Promise<void> {
  cached = identity;
  persist(identity);
}

export function exportIdentity(): Identity | null {
  return cached;
}

// --- signing and verifying --------------------------------------------------

async function privateKeyFor(identity: Identity): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', identity.privateJwk, keyParams(identity.alg) as AlgorithmIdentifier, false, [
    'sign',
  ]);
}

/** Sign any JSON-shaped value. The value is canonicalised first. */
export async function signValue(value: unknown, identity = cached): Promise<string> {
  if (!identity) throw new Error('No identity loaded.');
  const key = await privateKeyFor(identity);
  const sig = await crypto.subtle.sign(
    signParams(identity.alg) as AlgorithmIdentifier,
    key,
    utf8(canonical(value)) as BufferSource,
  );
  return toB64url(sig);
}

/**
 * Check a signature against a public key. Returns false rather than throwing on
 * malformed input — a bad signature and unreadable bytes mean the same thing to
 * a caller, and neither should take the app down.
 */
export async function verifyValue(
  value: unknown,
  signature: string,
  publicKeyB64: string,
  alg: SigAlg,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromB64url(publicKeyB64) as BufferSource,
      keyParams(alg) as AlgorithmIdentifier,
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      signParams(alg) as AlgorithmIdentifier,
      key,
      fromB64url(signature) as BufferSource,
      utf8(canonical(value)) as BufferSource,
    );
  } catch {
    return false;
  }
}

/**
 * The full check for something that claims to come from `claimedId`.
 *
 * A valid signature alone is not enough — it only proves *some* key signed it.
 * Trust requires that the claimed id is that key's fingerprint, which is what
 * makes an id unclaimable by anyone else.
 */
export async function verifyOwnership(
  value: unknown,
  signature: string | undefined,
  publicKeyB64: string | undefined,
  alg: SigAlg | undefined,
  claimedId: string,
): Promise<Verification> {
  if (!signature || !publicKeyB64 || !alg) return 'legacy';
  if (!(await verifyValue(value, signature, publicKeyB64, alg))) return 'invalid';
  return (await fingerprintOf(publicKeyB64)) === claimedId ? 'verified' : 'unverified';
}

export const VERIFICATION_LABEL: Record<Verification, { label: string; tone: 'ok' | 'warn' | 'danger' | ''; hint: string }> = {
  verified: {
    label: 'Verified',
    tone: 'ok',
    hint: 'Signed with the key this profile ID is derived from. Nobody else can publish as them.',
  },
  legacy: {
    label: 'Unsigned',
    tone: '',
    hint: 'Made before Pourfolio had signing. Nothing suspicious — just nothing to check against.',
  },
  unverified: {
    label: 'Unconfirmed ID',
    tone: 'warn',
    hint: 'The signature is valid, but this profile ID predates its key, so the two cannot be tied together.',
  },
  invalid: {
    label: 'Bad signature',
    tone: 'danger',
    hint: 'This was signed, and the signature does not check out. Do not trust it.',
  },
};
