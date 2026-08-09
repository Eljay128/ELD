import { useRef } from 'react';
import { BRANDS } from '../catalog/index.ts';
import type { AppState } from '../model/types.ts';
import { exportBackup, identitySnapshot, importBackup, resetAll } from '../model/store.ts';
import { CopyButton, Group, VerificationTag } from './ui.tsx';

export function Settings({
  state,
  stats,
  onToast,
}: {
  state: AppState;
  stats: { brands: number; drinks: number; options: number };
  onToast: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="page-head">
        <h1>Settings &amp; data</h1>
        <p>Everything Pourfolio knows lives in this browser. Nothing is uploaded, and there is no account behind it.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Your identity</h2>
          <VerificationTag verification={state.me.signature ? 'verified' : 'legacy'} />
        </div>
        <IdentityPanel state={state} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Where your data lives</h2>
        </div>
        <p className="muted">
          Your profile and every peer you have imported are stored in this browser's local storage. Clearing site data,
          using a different browser, or switching devices means starting fresh — so keep a backup if the profile matters
          to you. <strong>The backup now contains your signing key</strong>, which is the only way to keep the same
          identity on another device.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportBackup()], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `pourfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              onToast('Backup downloaded');
            }}
          >
            Download a backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </button>
          <CopyButton text={exportBackup()} label="Copy backup JSON" onCopied={() => onToast('Backup copied')} />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await importBackup(await file.text());
                onToast('Backup restored');
              } catch (err) {
                onToast(err instanceof Error ? err.message : 'That backup could not be read.');
              }
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>What is in the catalog</h2>
        </div>
        <table className="stats">
          <tbody>
            <tr>
              <td>Shops &amp; venues</td>
              <td>{stats.brands}</td>
            </tr>
            <tr>
              <td>Drinks</td>
              <td>{stats.drinks}</td>
            </tr>
            <tr>
              <td>Individual customization options</td>
              <td>{stats.options.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Your saved orders</td>
              <td>{state.me.orders.length}</td>
            </tr>
            <tr>
              <td>People you have imported</td>
              <td>{state.peers.length}</td>
            </tr>
          </tbody>
        </table>

        <div className="row-tight" style={{ marginTop: 14 }}>
          {BRANDS.map((b) => (
            <span key={b.id} className="chip static">
              {b.emoji} {b.short} <span className="sub">{b.drinks.length}</span>
            </span>
          ))}
        </div>

        <details className="more">
          <summary>Where the option data came from</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <p className="faint">
              Menus change constantly and vary by region — treat the catalog as a well-stocked starting point rather than
              a live menu. Every drink also carries a free-text note field for whatever the structure does not cover.
            </p>
            {BRANDS.filter((b) => b.sources?.length).map((b) => (
              <div key={b.id} className="tiny">
                <strong>{b.name}</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {b.sources!.map((s) => (
                    <li key={s} className="muted" style={{ overflowWrap: 'anywhere' }}>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Privacy</h2>
        </div>
        <ul className="muted" style={{ paddingLeft: 20, margin: 0 }}>
          <li>No account, no sign-in, no server storing your profile.</li>
          <li>No analytics and no third-party requests — the built app makes no network calls at all.</li>
          <li>
            A share code contains your whole profile in plain compressed form. It is <strong>not encrypted</strong> —
            anyone you send it to, or who sees it over your shoulder, can read it. Share it the way you would share a
            phone number.
          </li>
          <li>Direct device-to-device swaps use a public STUN server only to find a route; your profile never touches it.</li>
          <li>
            Your signing key is generated on this device and never leaves it, except inside a backup file you download
            yourself.
          </li>
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Danger zone</h2>
        </div>
        <Group label="Start over" hint="Deletes your profile and every peer on this device. A backup is the only way back.">
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Delete your profile and all imported peers from this device? This cannot be undone.')) {
                resetAll();
                onToast('Everything cleared');
              }
            }}
          >
            Erase everything
          </button>
        </Group>
      </div>
    </>
  );
}

/**
 * The identity panel exists mostly to make the key *visible*. A key nobody
 * knows about is a key nobody backs up, and losing it means losing the ability
 * to prove a profile is yours.
 */
function IdentityPanel({ state }: { state: AppState }) {
  const identity = identitySnapshot();

  if (!identity) {
    return <p className="muted">Setting up your signing key…</p>;
  }

  const idMatchesKey = state.me.id === identity.fingerprint;

  return (
    <>
      <p className="muted">
        Every profile and round you send is signed with a key held only on this device. Peers check the signature, so
        nobody can publish a drink order in your name — and that holds even if a future relay is compromised.
      </p>

      <table className="stats">
        <tbody>
          <tr>
            <td>Key fingerprint</td>
            <td className="mono">{identity.fingerprint}</td>
          </tr>
          <tr>
            <td>Your profile ID</td>
            <td className="mono">{state.me.id}</td>
          </tr>
          <tr>
            <td>Algorithm</td>
            <td>{identity.alg}</td>
          </tr>
          <tr>
            <td>Created</td>
            <td>{new Date(identity.createdAt).toLocaleDateString()}</td>
          </tr>
        </tbody>
      </table>

      {!idMatchesKey && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span>ℹ️</span>
          <div>
            <strong>Your profile ID predates your key.</strong>
            <div>
              Your profile was created before Pourfolio had signing, so its ID is not derived from this key and the two
              cannot be tied together. Everything still works and everything is still signed — peers just see
              “Unconfirmed ID” rather than “Verified”. Keeping the old ID means every share link you have already sent
              still resolves to you; the alternative would break all of them.
            </div>
          </div>
        </div>
      )}

      <div className="banner" style={{ marginTop: 12 }}>
        <span>🔑</span>
        <div>
          <strong>Back this up.</strong>
          <div>
            There is no account and no reset link. If you lose this device without a backup, you lose the key — your
            drinks can be re-entered, but the identity cannot be recovered.
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <CopyButton text={identity.publicKey} label="Copy public key" />
      </div>
    </>
  );
}
