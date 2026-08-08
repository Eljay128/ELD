import { useRef } from 'react';
import { BRANDS } from '../catalog/index.ts';
import type { AppState } from '../model/types.ts';
import { exportBackup, importBackup, resetAll } from '../model/store.ts';
import { CopyButton, Group } from './ui.tsx';

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
          <h2>Where your data lives</h2>
        </div>
        <p className="muted">
          Your profile and every peer you have imported are stored in this browser's local storage. Clearing site data,
          using a different browser, or switching devices means starting fresh — so keep a backup if the profile matters
          to you.
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
                importBackup(await file.text());
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
