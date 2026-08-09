import { useCallback, useRef, useState } from 'react';
import type { Profile, Round } from '../model/types.ts';
import type { P2PPhase, P2PSession } from '../model/p2p.ts';
import { answerOffer, p2pSupported, startOffer } from '../model/p2p.ts';
import { importPeerVerified, receiveRounds } from '../model/store.ts';
import { CopyButton, Field } from './ui.tsx';

/**
 * The direct-connection path: two browsers trade one blob each and then swap
 * profiles over a WebRTC data channel. Both sides end up with each other's
 * profile from a single handshake, which a one-way share code cannot do.
 */
export function P2PPanel({
  me,
  rounds,
  onImported,
}: {
  me: Profile;
  rounds: Round[];
  onImported: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'offering' | 'answering'>('idle');
  const [phase, setPhase] = useState<P2PPhase>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [myBlob, setMyBlob] = useState('');
  const [theirBlob, setTheirBlob] = useState('');
  const session = useRef<P2PSession | null>(null);

  const events = useCallback(
    () => ({
      onPhase: (p: P2PPhase, d?: string) => {
        setPhase(p);
        setDetail(d ?? null);
      },
      onRounds: async (incoming: Round[]) => {
        const added = await receiveRounds(incoming);
        if (added > 0) onImported(`Received ${added} round${added === 1 ? '' : 's'} of activity`);
      },
      onProfile: async (profile: Profile) => {
        const { status, peer } = await importPeerVerified(profile, 'p2p');
        onImported(
          status === 'self'
            ? 'That was your own profile.'
            : status === 'updated'
              ? `Updated ${peer.profile.name || 'peer'} over the direct link`
              : status === 'unchanged'
                ? `${peer.profile.name || 'Peer'} was already current`
                : `Received ${peer.profile.name || 'a profile'} over the direct link`,
        );
      },
    }),
    [onImported],
  );

  const reset = () => {
    session.current?.close();
    session.current = null;
    setMode('idle');
    setPhase('idle');
    setDetail(null);
    setMyBlob('');
    setTheirBlob('');
  };

  if (!p2pSupported()) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Swap directly, device to device</h2>
        <span className="tag">no server</span>
      </div>
      <p className="muted">
        Trade one blob of text each — over any chat app, or read aloud — and the two browsers connect directly. You both
        end up with each other's profile in a single round. Share codes only go one way; this goes both.
      </p>

      {mode === 'idle' && (
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              setMode('offering');
              const s = startOffer(me, events(), rounds);
              session.current = s;
              s.blob.then(setMyBlob).catch(() => setDetail('Could not create an invitation.'));
            }}
          >
            Start a swap
          </button>
          <button className="btn" onClick={() => setMode('answering')}>
            I was sent an invitation
          </button>
        </div>
      )}

      {mode === 'offering' && (
        <div className="stack" style={{ marginTop: 12 }}>
          <Field label="Step 1 — send them this invitation">
            <textarea className="code" rows={4} readOnly value={myBlob || 'Preparing…'} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="row">
            <CopyButton className="btn primary" text={myBlob} label="Copy invitation" />
          </div>
          <Field label="Step 2 — paste the reply they send back">
            <textarea className="code" rows={4} value={theirBlob} placeholder="PFX1.…" onChange={(e) => setTheirBlob(e.target.value)} />
          </Field>
          <div className="row">
            <button
              className="btn primary"
              disabled={!theirBlob.trim()}
              onClick={() => session.current?.accept(theirBlob).catch((e) => setDetail(String(e.message ?? e)))}
            >
              Connect
            </button>
            <button className="btn ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'answering' && (
        <div className="stack" style={{ marginTop: 12 }}>
          <Field label="Step 1 — paste the invitation they sent you">
            <textarea className="code" rows={4} value={theirBlob} placeholder="PFX1.…" onChange={(e) => setTheirBlob(e.target.value)} />
          </Field>
          <div className="row">
            <button
              className="btn primary"
              disabled={!theirBlob.trim() || !!myBlob}
              onClick={() => {
                try {
                  const s = answerOffer(me, theirBlob, events(), rounds);
                  session.current = s;
                  s.blob.then(setMyBlob).catch((e) => setDetail(String(e.message ?? e)));
                } catch (e) {
                  setDetail(e instanceof Error ? e.message : 'That invitation could not be read.');
                }
              }}
            >
              Generate my reply
            </button>
            <button className="btn ghost" onClick={reset}>Cancel</button>
          </div>
          {myBlob && (
            <>
              <Field label="Step 2 — send this reply back to them">
                <textarea className="code" rows={4} readOnly value={myBlob} onFocus={(e) => e.currentTarget.select()} />
              </Field>
              <CopyButton className="btn primary" text={myBlob} label="Copy reply" />
            </>
          )}
        </div>
      )}

      {phase !== 'idle' && (
        <div className={`banner ${phase === 'exchanged' ? 'ok' : phase === 'failed' ? 'danger' : ''}`} style={{ marginTop: 12 }}>
          <span>{PHASE_ICON[phase]}</span>
          <div>
            <strong>{PHASE_TEXT[phase]}</strong>
            {detail && <div>{detail}</div>}
            {phase === 'exchanged' && (
              <button className="btn small" style={{ marginTop: 8 }} onClick={reset}>
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PHASE_TEXT: Record<P2PPhase, string> = {
  idle: '',
  'creating-offer': 'Building your invitation…',
  'waiting-for-answer': 'Invitation ready — send it and paste their reply.',
  'creating-answer': 'Building your reply…',
  connecting: 'Connecting directly…',
  connected: 'Connected. Trading profiles…',
  exchanged: 'Profiles swapped.',
  failed: 'The direct connection did not work.',
  closed: 'Connection closed.',
};

const PHASE_ICON: Record<P2PPhase, string> = {
  idle: '',
  'creating-offer': '⏳',
  'waiting-for-answer': '📨',
  'creating-answer': '⏳',
  connecting: '🔗',
  connected: '🔗',
  exchanged: '✅',
  failed: '⚠️',
  closed: '🔌',
};
