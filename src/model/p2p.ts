import type { Profile } from './types.ts';
import { decodeProfile, encodeProfile } from './share.ts';

/**
 * Direct peer-to-peer profile exchange over WebRTC, with **no signalling
 * server**. The two sides trade one offer blob and one answer blob by whatever
 * channel they already have — text message, email, a shared doc, reading it
 * aloud — and after that the profiles move directly between the two browsers.
 *
 * This is the literal peer-to-peer path. Share codes and QR are the everyday
 * path; this one is for "we are both here, let us just swap and both end up
 * with each other's profile in one go".
 *
 * STUN is used only to discover a reflexive address so two machines behind
 * different NATs can meet. No profile data touches it. Set `iceServers: []` in
 * `connect()` to stay strictly on the local network.
 */

const DEFAULT_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type P2PPhase =
  | 'idle'
  | 'creating-offer'
  | 'waiting-for-answer'
  | 'creating-answer'
  | 'connecting'
  | 'connected'
  | 'exchanged'
  | 'failed'
  | 'closed';

export interface P2PEvents {
  onPhase(phase: P2PPhase, detail?: string): void;
  /** Fired once the other side's profile arrives. */
  onProfile(profile: Profile): void;
}

export interface P2PSession {
  /** The blob to hand to the other person. */
  blob: Promise<string>;
  /** Feed in the blob they send back (initiator only). */
  accept(remoteBlob: string): Promise<void>;
  close(): void;
}

const CHANNEL = 'pourfolio';

/** Wrap SDP in the same PF-style envelope so users can tell blobs apart. */
function packSignal(desc: RTCSessionDescriptionInit): string {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp });
  return 'PFX1.' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unpackSignal(blob: string): RTCSessionDescriptionInit {
  const match = /PFX1\.([A-Za-z0-9_-]+)/.exec(blob.trim());
  if (!match) throw new Error('That is not a Pourfolio connection blob.');
  const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const { t, s } = JSON.parse(decodeURIComponent(escape(atob(padded))));
  return { type: t as RTCSdpType, sdp: s as string };
}

/**
 * Wait for ICE gathering to finish so the blob we hand over is complete —
 * "vanilla ICE". It means one copy-paste per side instead of a trickle.
 */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    // Some networks never reach `complete`; ship what we have after a beat.
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', done);
      resolve();
    }, 3000);
  });
}

function wireChannel(channel: RTCDataChannel, me: Profile, events: P2PEvents): void {
  channel.onopen = () => {
    events.onPhase('connected');
    channel.send(encodeProfile(me));
  };
  channel.onmessage = (e) => {
    try {
      events.onProfile(decodeProfile(String(e.data)));
      events.onPhase('exchanged');
    } catch (err) {
      events.onPhase('failed', err instanceof Error ? err.message : 'Could not read what they sent.');
    }
  };
  channel.onerror = () => events.onPhase('failed', 'The direct connection dropped.');
}

/** Side A: create the invitation blob, then accept the reply blob. */
export function startOffer(me: Profile, events: P2PEvents, iceServers: RTCIceServer[] = DEFAULT_ICE): P2PSession {
  const pc = new RTCPeerConnection({ iceServers });
  const channel = pc.createDataChannel(CHANNEL);
  wireChannel(channel, me, events);
  watchConnection(pc, events);

  events.onPhase('creating-offer');
  const blob = (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gathered(pc);
    events.onPhase('waiting-for-answer');
    return packSignal(pc.localDescription!);
  })();

  return {
    blob,
    async accept(remoteBlob: string) {
      events.onPhase('connecting');
      await pc.setRemoteDescription(unpackSignal(remoteBlob));
    },
    close: () => {
      pc.close();
      events.onPhase('closed');
    },
  };
}

/** Side B: take their invitation blob, produce the reply blob. */
export function answerOffer(
  me: Profile,
  remoteBlob: string,
  events: P2PEvents,
  iceServers: RTCIceServer[] = DEFAULT_ICE,
): P2PSession {
  const pc = new RTCPeerConnection({ iceServers });
  pc.ondatachannel = (e) => wireChannel(e.channel, me, events);
  watchConnection(pc, events);

  events.onPhase('creating-answer');
  const blob = (async () => {
    await pc.setRemoteDescription(unpackSignal(remoteBlob));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gathered(pc);
    events.onPhase('connecting');
    return packSignal(pc.localDescription!);
  })();

  return {
    blob,
    async accept() {
      // Side B has nothing further to accept; the handshake completes itself.
    },
    close: () => {
      pc.close();
      events.onPhase('closed');
    },
  };
}

function watchConnection(pc: RTCPeerConnection, events: P2PEvents): void {
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      events.onPhase('failed', 'Could not reach the other device directly. A share code always works.');
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
      events.onPhase('closed');
    }
  };
}

export function p2pSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}
