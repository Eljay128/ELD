import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  checkRelay,
  disableRelay,
  enableRelay,
  forgetMeOnRelay,
  relaySettings,
  relayState,
  subscribeRelay,
  type RelayStatus,
} from '../model/relay.ts';
import { Field, Group } from './ui.tsx';

const STATUS: Record<RelayStatus, { label: string; tone: string; hint: string }> = {
  off: { label: 'Off', tone: '', hint: 'Nothing leaves this device.' },
  connecting: { label: 'Connecting…', tone: 'warn', hint: 'Reaching the relay.' },
  registering: { label: 'Registering…', tone: 'warn', hint: 'Publishing your public keys.' },
  online: { label: 'Connected', tone: 'ok', hint: 'Rounds reach your peers even when they are away.' },
  offline: { label: 'Reconnecting…', tone: 'warn', hint: 'Lost the connection; retrying with backoff.' },
  error: { label: 'Problem', tone: 'danger', hint: 'See the message below.' },
};

/**
 * The relay is the one part of Pourfolio that involves a server, so this panel
 * is written to be read before it is switched on: what changes, what the relay
 * can see, and how to undo it.
 */
export function RelayPanel({ onToast }: { onToast: (msg: string) => void }) {
  const state = useSyncExternalStore(subscribeRelay, relayState, relayState);
  const [url, setUrl] = useState(relaySettings().url);
  const [checking, setChecking] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => setUrl(relaySettings().url), []);

  const enabled = relaySettings().enabled;
  const status = STATUS[state.status];

  return (
    <>
      <p className="muted">
        Without a relay, a round reaches a peer only while you are both connected. A relay holds the sealed round until
        they next open the app — that is the whole difference, and it is the only part of Pourfolio that involves a
        server.
      </p>

      <div className="banner" style={{ marginBottom: 14 }}>
        <span>🔐</span>
        <div>
          <strong>What a relay can and cannot see</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>
              <strong>Cannot read</strong> any drink, name, note, allergy or photo. Every round is encrypted for one
              recipient before it leaves this device.
            </li>
            <li>
              <strong>Can see</strong> that your profile ID sent something to another profile ID, and when. Over time
              that is a social graph — worth knowing before you switch it on.
            </li>
            <li>Undeliverable rounds are dropped after the relay's retention window, whether or not they arrived.</li>
          </ul>
        </div>
      </div>

      {!enabled ? (
        <div className="stack">
          <Field
            label="Relay address"
            hint="There is no default and no relay run by anyone but you. Run relay/server.mjs yourself, or paste an address someone you trust operates."
          >
            <input
              type="text"
              value={url}
              placeholder="http://localhost:8787"
              onChange={(e) => {
                setUrl(e.target.value);
                setProbe(null);
              }}
            />
          </Field>

          {probe && (
            <div className={`banner ${probe.ok ? 'ok' : 'danger'}`}>
              <span>{probe.ok ? '✓' : '⚠️'}</span>
              <div>{probe.detail}</div>
            </div>
          )}

          <div className="row">
            <button
              className="btn"
              disabled={!url.trim() || checking}
              onClick={async () => {
                setChecking(true);
                setProbe(await checkRelay(url.trim()));
                setChecking(false);
              }}
            >
              {checking ? 'Checking…' : 'Check this relay'}
            </button>
            <button
              className="btn primary"
              disabled={!url.trim()}
              onClick={async () => {
                try {
                  await enableRelay(url.trim());
                  onToast('Relay switched on');
                } catch (e) {
                  onToast(e instanceof Error ? e.message : 'Could not switch the relay on.');
                }
              }}
            >
              Switch it on
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="row-tight">
            <span className={`tag ${status.tone}`}>{status.label}</span>
            <span className="faint">{state.detail ?? status.hint}</span>
          </div>

          <table className="stats">
            <tbody>
              <tr>
                <td>Relay</td>
                <td className="mono">{relaySettings().url}</td>
              </tr>
              <tr>
                <td>Rounds sent through it</td>
                <td>{state.sent}</td>
              </tr>
              <tr>
                <td>Rounds received through it</td>
                <td>{state.received}</td>
              </tr>
            </tbody>
          </table>

          <Group label="Turn it off" hint="Switching off stops all traffic immediately. Forgetting also erases what the relay still holds for you.">
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  disableRelay();
                  onToast('Relay switched off');
                }}
              >
                Switch it off
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm('Erase your keys and any undelivered rounds from the relay, then switch it off?')) return;
                  try {
                    await forgetMeOnRelay();
                    onToast('The relay has forgotten you');
                  } catch (e) {
                    onToast(e instanceof Error ? e.message : 'Could not reach the relay to erase.');
                  }
                }}
              >
                Forget me and switch off
              </button>
            </div>
          </Group>
        </div>
      )}
    </>
  );
}
