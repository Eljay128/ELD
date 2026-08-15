import type { Identity, KexAlg } from './identity.ts';
import { canonical, fromB64url, kexParams, toB64url } from './identity.ts';

/**
 * Sealed envelopes.
 *
 * A round leaving this device for a relay is encrypted for exactly one
 * recipient. The relay stores and forwards opaque bytes; it can see who sent an
 * envelope to whom and when, and nothing else.
 *
 * Construction is ECDH → HKDF-SHA256 → AES-256-GCM. The sender's ephemeral-ish
 * public key travels with the envelope so the recipient can derive the same
 * secret without a round trip.
 *
 * **What this does not give you: forward secrecy.** Both sides use their
 * long-lived key-agreement keys, so anyone who later obtains a private key can
 * decrypt everything ever sent to it. Real forward secrecy needs a ratchet
 * (a new key per message, with both sides advancing state), which is a
 * substantially larger project. This is documented rather than glossed, and is
 * the honest ceiling of the current design.
 */

const INFO = 'pourfolio-envelope-v1';

export interface SealedEnvelope {
  /** Format version, so a future scheme can coexist. */
  v: 1;
  /** Sender's key-agreement public key, base64url. */
  epk: string;
  /** Which curve produced `epk`. Both sides must agree. */
  alg: KexAlg;
  /** HKDF salt, base64url. */
  salt: string;
  /** AES-GCM nonce, base64url. */
  iv: string;
  /** Ciphertext, base64url. */
  ct: string;
}

async function deriveKey(
  identity: Identity,
  peerPublicKeyB64: string,
  peerAlg: KexAlg,
  salt: Uint8Array,
): Promise<CryptoKey> {
  if (peerAlg !== identity.kexAlg) {
    // Both sides must be on the same curve. In practice everyone modern lands
    // on X25519; the mismatch case is a genuinely unusable pairing, not a
    // fallback we can paper over.
    throw new SealError(
      `Cannot exchange with this peer: they use ${peerAlg} and you use ${identity.kexAlg}.`,
    );
  }

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.encPrivateJwk,
    kexParams(identity.kexAlg) as AlgorithmIdentifier,
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'raw',
    fromB64url(peerPublicKeyB64) as BufferSource,
    kexParams(peerAlg) as AlgorithmIdentifier,
    false,
    [],
  );

  const shared = await crypto.subtle.deriveBits(
    peerAlg === 'X25519' ? { name: 'X25519', public: publicKey } : { name: 'ECDH', public: publicKey },
    privateKey,
    peerAlg === 'X25519' ? 256 : 256,
  );

  // HKDF turns a raw ECDH output into a proper symmetric key. Using the shared
  // secret directly as an AES key is a classic and avoidable mistake.
  const hkdfKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: new TextEncoder().encode(INFO) as BufferSource },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class SealError extends Error {}

/** Encrypt any JSON-shaped value for one recipient. */
export async function seal(
  value: unknown,
  identity: Identity,
  recipientEncPublicKey: string,
  recipientAlg: KexAlg,
): Promise<SealedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(identity, recipientEncPublicKey, recipientAlg, salt);
  const plaintext = new TextEncoder().encode(canonical(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext as BufferSource);

  return {
    v: 1,
    epk: identity.encPublicKey,
    alg: identity.kexAlg,
    salt: toB64url(salt),
    iv: toB64url(iv),
    ct: toB64url(ct),
  };
}

/**
 * Decrypt an envelope addressed to this identity. Throws rather than returning
 * null — a failure here means either tampering or a key mismatch, and both
 * deserve to be surfaced rather than silently dropped.
 */
export async function unseal<T>(envelope: SealedEnvelope, identity: Identity): Promise<T> {
  if (envelope?.v !== 1) throw new SealError('This envelope uses a newer format than this app understands.');
  const key = await deriveKey(identity, envelope.epk, envelope.alg, fromB64url(envelope.salt));
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64url(envelope.iv) as BufferSource },
      key,
      fromB64url(envelope.ct) as BufferSource,
    );
  } catch {
    // AES-GCM authenticates; a failure means the bytes were altered or this is
    // not addressed to us.
    throw new SealError('This message could not be opened — it was altered, or it is not addressed to you.');
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Rough transmitted size, for showing what a relay would actually see. */
export function envelopeBytes(envelope: SealedEnvelope): number {
  return JSON.stringify(envelope).length;
}
