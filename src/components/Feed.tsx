import { useEffect, useMemo, useState } from 'react';
import type { AppState, Round, RoundRecipient } from '../model/types.ts';
import { OCCASIONS, newId } from '../model/types.ts';
import { addRound, clearRounds, deleteRound, loadSampleRounds, receiveRounds } from '../model/store.ts';
import { formatOrder } from '../model/format.ts';
import { ShareCodeError, decodeRounds, encodeRounds } from '../model/share.ts';
import { Avatar, CopyButton, Empty, Field, Group, Modal } from './ui.tsx';

/**
 * The rounds feed.
 *
 * What is genuinely live here, and what is not, matters enough to be explicit:
 *
 *  - Rounds you log appear immediately, and immediately in any other tab or
 *    window you have open — the store broadcasts through the `storage` event,
 *    so two windows stay in step with no polling.
 *  - Rounds from a peer arrive the moment a direct connection is open, and
 *    otherwise when you exchange an activity code.
 *  - Timestamps re-render on a timer, so "just now" becomes "4 min ago" while
 *    you are looking at it.
 *
 * What it is *not* is a always-on global timeline. Pushing activity to someone
 * who is not connected needs a server to hold it, and this app deliberately has
 * none. The feed says so rather than implying a connection that is not there.
 */
export function Feed({ state, onToast }: { state: AppState; onToast: (msg: string) => void }) {
  const [logging, setLogging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mine' | 'peers'>('all');

  // Re-render on a timer so relative times stay honest without a reload.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const rounds = useMemo(() => {
    const list = [...state.rounds].sort((a, b) => b.at - a.at);
    if (filter === 'mine') return list.filter((r) => r.buyerId === state.me.id);
    if (filter === 'peers') return list.filter((r) => r.buyerId !== state.me.id);
    return list;
  }, [state.rounds, state.me.id, filter]);

  const boughtForMe = state.rounds.filter((r) => r.recipients.some((x) => x.id === state.me.id)).length;
  const boughtByMe = state.rounds.filter((r) => r.buyerId === state.me.id).length;

  return (
    <>
      <div className="page-head">
        <h1>Rounds</h1>
        <p>
          Who bought what for whom. Log a round when you buy, and it shows up here and in every window you have open —
          and on your peers' feeds the moment you are connected.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Activity</h2>
          <span className="live-dot" aria-hidden="true" />
          <span className="faint">Live on this device</span>
          <button className="btn primary small spacer" onClick={() => setLogging(true)}>
            Log a round
          </button>
          <button className="btn small" onClick={() => setImporting(true)}>
            Sync with a peer
          </button>
        </div>

        <div className="row" style={{ gap: 18 }}>
          <div className="tally">
            <strong>{boughtByMe}</strong> <span className="muted">rounds you bought</span>
          </div>
          <div className="tally">
            <strong>{boughtForMe}</strong> <span className="muted">drinks bought for you</span>
          </div>
        </div>
      </div>

      {state.rounds.length > 0 && (
        <nav className="segmented" aria-label="Filter activity" style={{ marginTop: 14 }}>
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Everything <span className="seg-count">{state.rounds.length}</span>
          </button>
          <button aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>
            Bought by you <span className="seg-count">{boughtByMe}</span>
          </button>
          <button aria-pressed={filter === 'peers'} onClick={() => setFilter('peers')}>
            Bought by peers <span className="seg-count">{state.rounds.length - boughtByMe}</span>
          </button>
        </nav>
      )}

      {rounds.length === 0 ? (
        <Empty icon="🧾" title={state.rounds.length === 0 ? 'No rounds yet' : 'Nothing matches that filter'}>
          {state.rounds.length === 0 && (
            <>
              <div>Log the next one you buy and it will show up here.</div>
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn primary" onClick={() => setLogging(true)}>
                  Log a round
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const n = loadSampleRounds();
                    onToast(n > 0 ? 'Added example activity' : 'Example activity is already here');
                  }}
                >
                  Show example activity
                </button>
              </div>
            </>
          )}
        </Empty>
      ) : (
        <ol className="feed">
          {rounds.map((round) => (
            <RoundItem key={round.id} round={round} meId={state.me.id} />
          ))}
        </ol>
      )}

      {state.rounds.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn ghost danger"
            onClick={() => {
              if (confirm('Clear the whole activity feed on this device?')) {
                clearRounds();
                onToast('Activity cleared');
              }
            }}
          >
            Clear activity
          </button>
        </div>
      )}

      <div className="banner" style={{ marginTop: 18 }}>
        <span>📡</span>
        <div>
          <strong>How live this really is</strong>
          <div className="muted" style={{ marginTop: 2 }}>
            Rounds appear instantly here and in your other open windows, and transfer the moment you open a direct
            connection with a peer on the <strong>Share</strong> tab. Reaching someone who is not connected would need a
            server holding your activity — Pourfolio does not have one, so it does not pretend to.
          </div>
        </div>
      </div>

      {logging && <LogRound state={state} onClose={() => setLogging(false)} onToast={onToast} />}
      {importing && <SyncRounds state={state} onClose={() => setImporting(false)} onToast={onToast} />}
    </>
  );
}

function RoundItem({ round, meId }: { round: Round; meId: string }) {
  const buyerIsMe = round.buyerId === meId;
  const occasion = OCCASIONS.find((o) => o.id === round.occasion);

  return (
    <li className={`feed-item${buyerIsMe ? ' mine' : ''}`}>
      <div className="feed-avatar">
        <Avatar emoji={round.buyerEmoji} src={round.buyerAvatar} name={round.buyerName} size={40} />
      </div>

      <div className="feed-body">
        <div className="feed-line">
          <strong>{buyerIsMe ? 'You' : round.buyerName}</strong> bought{' '}
          <strong>{namesOf(round.recipients, meId)}</strong>
          {round.recipients.length > 1 ? ' a round' : ' a drink'}
          {occasion && <span className="tag" style={{ marginLeft: 6 }}>{occasion.emoji} {occasion.label}</span>}
          {round.source === 'sample' && <span className="tag" style={{ marginLeft: 6 }}>example</span>}
        </div>

        <ul className="feed-drinks">
          {round.recipients.map((r) => (
            <li key={r.id + r.drink}>
              <Avatar emoji={r.emoji} name={r.name} size={22} />
              <span className="feed-who">{r.id === meId ? 'You' : r.name}</span>
              <span className="feed-what">
                <span aria-hidden="true">{r.brandEmoji}</span> {r.drink}
              </span>
            </li>
          ))}
        </ul>

        {round.note && <p className="feed-note">“{round.note}”</p>}

        <div className="feed-meta">
          <time dateTime={new Date(round.at).toISOString()} title={new Date(round.at).toLocaleString()}>
            {relativeTime(round.at)}
          </time>
          <button className="btn ghost small" onClick={() => deleteRound(round.id)} aria-label="Remove this round">
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function namesOf(recipients: RoundRecipient[], meId: string): string {
  const names = recipients.map((r) => (r.id === meId ? 'you' : r.name));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "just now" / "12 min ago" / "3 hr ago" / "Tue" — no library needed. */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Logging a round
// ---------------------------------------------------------------------------

function LogRound({ state, onClose, onToast }: { state: AppState; onClose: () => void; onToast: (m: string) => void }) {
  const [buyerIsMe, setBuyerIsMe] = useState(true);
  const [buyerPeerId, setBuyerPeerId] = useState(state.peers[0]?.profile.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [occasion, setOccasion] = useState('');
  const [note, setNote] = useState('');

  /** Everyone who could be on either side of a round. */
  const everyone = [
    { id: state.me.id, name: state.me.name || 'You', emoji: state.me.emoji, avatar: state.me.avatar, orders: state.me.orders },
    ...state.peers.map((p) => ({
      id: p.profile.id,
      name: p.profile.name || 'Unnamed',
      emoji: p.profile.emoji,
      avatar: p.profile.avatar,
      orders: p.profile.orders,
    })),
  ];

  const buyer = buyerIsMe ? everyone[0] : everyone.find((p) => p.id === buyerPeerId);
  const canSave = !!buyer && selected.length > 0;

  const save = () => {
    if (!buyer) return;
    const recipients: RoundRecipient[] = selected.flatMap((id) => {
      const person = everyone.find((p) => p.id === id);
      if (!person) return [];
      // Their go-to for the time of day is the drink they would actually get.
      const order = pickTheirDrink(person.orders);
      const f = order ? formatOrder(order) : null;
      return [
        {
          id: person.id,
          name: person.name,
          emoji: person.emoji,
          drink: f ? f.line : 'their usual',
          brand: f ? f.brandName : 'Unspecified',
          brandEmoji: f ? f.brandEmoji : '🥤',
        },
      ];
    });

    addRound({
      id: newId(),
      at: Date.now(),
      buyerId: buyer.id,
      buyerName: buyer.name,
      buyerEmoji: buyer.emoji,
      buyerAvatar: buyer.avatar,
      recipients,
      occasion: occasion || undefined,
      note: note.trim() || undefined,
      source: buyer.id === state.me.id ? 'me' : 'peer',
    });
    onToast('Round logged');
    onClose();
  };

  return (
    <Modal
      title="Log a round"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div className="spacer" />
          <button className="btn primary" disabled={!canSave} onClick={save}>
            Log it
          </button>
        </>
      }
    >
      <div className="stack">
        <Group label="Who paid">
          <div className="row-tight">
            <button className="chip" aria-pressed={buyerIsMe} onClick={() => setBuyerIsMe(true)}>
              <Avatar emoji={state.me.emoji} src={state.me.avatar} name={state.me.name} size={22} />
              {state.me.name || 'You'}
            </button>
            {state.peers.map((p) => (
              <button
                key={p.profile.id}
                className="chip"
                aria-pressed={!buyerIsMe && buyerPeerId === p.profile.id}
                onClick={() => {
                  setBuyerIsMe(false);
                  setBuyerPeerId(p.profile.id);
                }}
              >
                <Avatar emoji={p.profile.emoji} src={p.profile.avatar} name={p.profile.name} size={22} />
                {p.profile.name || 'Unnamed'}
              </button>
            ))}
          </div>
        </Group>

        <Group label="Who got a drink" hint="Each person's go-to order is recorded as what they were handed.">
          <div className="row-tight">
            {everyone.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  className="chip"
                  aria-pressed={on}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                >
                  <Avatar emoji={p.emoji} src={p.avatar} name={p.name} size={22} />
                  {p.id === state.me.id ? 'You' : p.name}
                </button>
              );
            })}
          </div>
          {state.peers.length === 0 && (
            <div className="faint" style={{ marginTop: 6 }}>
              Import some peers and they will show up here.
            </div>
          )}
        </Group>

        <Group label="Occasion">
          <div className="row-tight">
            {OCCASIONS.map((o) => (
              <button key={o.id} className="chip" aria-pressed={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? '' : o.id)}>
                {o.emoji} {o.label}
              </button>
            ))}
          </div>
        </Group>

        <Field label="Note">
          <input type="text" value={note} placeholder="Standup ran long. Rescue mission." onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Prefer a marked go-to, then whatever suits the time of day, then anything. */
function pickTheirDrink(orders: AppState['me']['orders']) {
  if (orders.length === 0) return null;
  const hour = new Date().getHours();
  const daypart = hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
  const inDaypart = orders.filter((o) => o.daypart === daypart);
  return inDaypart.find((o) => o.favorite) ?? inDaypart[0] ?? orders.find((o) => o.favorite) ?? orders[0];
}

// ---------------------------------------------------------------------------
// Exchanging activity with a peer
// ---------------------------------------------------------------------------

function SyncRounds({ state, onClose, onToast }: { state: AppState; onClose: () => void; onToast: (m: string) => void }) {
  const [incoming, setIncoming] = useState('');
  const [error, setError] = useState<string | null>(null);
  const code = useMemo(() => encodeRounds(state.rounds.filter((r) => r.source !== 'sample').slice(0, 50)), [state.rounds]);
  const shareable = state.rounds.filter((r) => r.source !== 'sample').length;

  return (
    <Modal
      title="Sync activity with a peer"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="muted">
        Activity travels the same way profiles do — as a code you hand over. Open a direct connection on the{' '}
        <strong>Share</strong> tab and it transfers by itself instead.
      </p>

      <div className="stack">
        <Field label="Your activity code" hint={`${shareable} round${shareable === 1 ? '' : 's'} to send. Example activity is never included.`}>
          <textarea className="code" rows={3} readOnly value={code} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div className="row">
          <CopyButton className="btn primary" text={code} label="Copy activity code" onCopied={() => onToast('Activity code copied')} />
        </div>

        <Field label="Paste theirs">
          <textarea className="code" rows={3} value={incoming} placeholder="PFR1.…" onChange={(e) => setIncoming(e.target.value)} />
        </Field>
        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <div>{error}</div>
          </div>
        )}
        <div className="row">
          <button
            className="btn primary"
            disabled={!incoming.trim()}
            onClick={() => {
              try {
                const added = receiveRounds(decodeRounds(incoming));
                setError(null);
                setIncoming('');
                onToast(added > 0 ? `Added ${added} round${added === 1 ? '' : 's'}` : 'Already up to date');
              } catch (e) {
                setError(e instanceof ShareCodeError ? e.message : 'That code could not be read.');
              }
            }}
          >
            Merge their activity
          </button>
        </div>
      </div>
    </Modal>
  );
}
