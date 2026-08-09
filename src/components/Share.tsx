import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import type { AppState, Circle } from '../model/types.ts';
import { CIRCLES } from '../model/types.ts';
import { ShareCodeError, decodeProfile, encodeProfile, encodeProfileSlim, shareLink } from '../model/share.ts';
import { importPeerVerified } from '../model/store.ts';
import { profileToText } from '../model/format.ts';
import { CopyButton, Field, Group, QR } from './ui.tsx';
import { P2PPanel } from './P2P.tsx';

export function Share({ state, onImported }: { state: AppState; onImported: (msg: string) => void }) {
  const me = state.me;
  const ready = me.name.trim().length > 0 && me.orders.length > 0;
  const code = useMemo(() => encodeProfile(me), [me]);
  const link = useMemo(() => shareLink(me), [me]);
  // A photo is worth several kilobytes, which a QR code cannot hold. Rather
  // than render an unscannable block, the QR carries the photo-less profile and
  // says so — the link and file still include the picture.
  const slimCode = useMemo(() => encodeProfileSlim(me), [me]);
  const qrPayload = me.avatar ? `${location.origin}${location.pathname}#add=${slimCode}` : link;

  return (
    <>
      <div className="page-head">
        <h1>Share &amp; receive</h1>
        <p>
          Your profile travels as a self-contained code. There is no server holding it, no account to create, and nothing
          to look up — whoever has the code has the profile, and that is the whole system.
        </p>
      </div>

      {!ready && (
        <div className="banner warn" style={{ marginBottom: 14 }}>
          <span>📝</span>
          <div>
            Your profile is still thin — add your name and at least one drink and the code becomes worth sending.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Send yours</h2>
          <span className="tag">{code.length.toLocaleString()} characters</span>
        </div>
        <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div className="stack">
              <Field label="Share link" hint="Opens the app with your profile ready to import.">
                <textarea className="code" readOnly value={link} rows={3} onFocus={(e) => e.currentTarget.select()} />
              </Field>
              <div className="row">
                <CopyButton className="btn primary" text={link} label="Copy link" onCopied={() => onImported('Share link copied')} />
                <CopyButton text={code} label="Copy raw code" onCopied={() => onImported('Share code copied')} />
                <CopyButton text={profileToText(me)} label="Copy as plain text" onCopied={() => onImported('Plain text copied')} />
                <button
                  className="btn"
                  onClick={() => {
                    const blob = new Blob([code], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${(me.name || 'profile').replace(/\W+/g, '-').toLowerCase()}.pourfolio`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download file
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    className="btn"
                    onClick={() => navigator.share({ title: `${me.name}'s beverage profile`, text: profileToText(me), url: link }).catch(() => {})}
                  >
                    Share…
                  </button>
                )}
              </div>
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <QR text={qrPayload} label="QR code containing your beverage profile" />
            <div className="faint" style={{ textAlign: 'center', marginTop: 6, maxWidth: 240 }}>
              {me.avatar ? 'Point a phone at this — the QR leaves your picture out to stay scannable.' : 'Point a phone at this'}
            </div>
          </div>
        </div>
      </div>

      <ImportCard onImported={onImported} />

      <P2PPanel me={me} rounds={state.rounds} onImported={onImported} />
    </>
  );
}

function ImportCard({ onImported }: { onImported: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [circle, setCircle] = useState<Circle>('friends');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = async (raw: string, source: 'code' | 'file' | 'qr') => {
    try {
      const profile = decodeProfile(raw);
      const { status, peer } = await importPeerVerified(profile, source, circle);
      setError(null);
      setText('');
      onImported(
        status === 'self'
          ? 'That is your own profile — nothing to import.'
          : status === 'added'
            ? `Added ${peer.profile.name || 'a peer'}`
            : status === 'updated'
              ? `Updated ${peer.profile.name || 'a peer'} to their newest version`
              : `${peer.profile.name || 'That peer'} is already up to date`,
      );
    } catch (e) {
      setError(e instanceof ShareCodeError ? e.message : 'Could not read that code.');
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Receive someone else's</h2>
      </div>
      <div className="stack">
        <Group label="Add them to">
          <div className="row-tight">
            {CIRCLES.map((c) => (
              <button key={c.id} className="chip" aria-pressed={circle === c.id} onClick={() => setCircle(c.id)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </Group>

        <Field label="Paste a code or link" hint="A whole message works too — the code is picked out of it.">
          <textarea
            className="code"
            rows={3}
            value={text}
            placeholder="PF1.… or https://…#add=PF1.…"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>

        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <div>{error}</div>
          </div>
        )}

        <div className="row">
          <button className="btn primary" disabled={!text.trim()} onClick={() => void doImport(text, 'code')}>
            Import
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Open a .pourfolio file
          </button>
          <button className="btn" onClick={() => setScanning((s) => !s)}>
            {scanning ? 'Stop camera' : 'Scan a QR code'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pourfolio,text/plain,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await doImport(await file.text(), 'file');
              e.target.value = '';
            }}
          />
        </div>

        {scanning && <QrScanner onFound={(raw) => { setScanning(false); void doImport(raw, 'qr'); }} onError={setError} />}
      </div>
    </div>
  );
}

/** Camera QR scanning, decoded locally frame by frame. No upload, ever. */
function QrScanner({ onFound, onError }: { onFound: (text: string) => void; onError: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const video = videoRef.current;
      if (cancelled || !video || !ctx) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          onFound(found.data);
          return;
        }
        setStatus('Point the camera at their QR code');
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        raf = requestAnimationFrame(tick);
      } catch {
        onError('Could not open the camera. Paste the code instead — it works the same.');
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onFound, onError]);

  return (
    <div>
      <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 380, borderRadius: 12, background: '#000' }} />
      <div className="faint">{status}</div>
    </div>
  );
}
