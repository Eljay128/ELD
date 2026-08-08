import { useState } from 'react';
import { DAYPARTS } from '../catalog/index.ts';
import type { Circle, Peer } from '../model/types.ts';
import { CIRCLES, DIET_FLAGS } from '../model/types.ts';
import { loadSamplePeers, removePeer, setPeerCircle, toggleRunSelection } from '../model/store.ts';
import { formatOrder, profileToText } from '../model/format.ts';
import { Avatar, CopyButton, Empty, Modal } from './ui.tsx';

export function Peers({ peers, runSelection }: { peers: Peer[]; runSelection: string[] }) {
  const [filter, setFilter] = useState<Circle | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Peer | null>(null);

  const visible = peers.filter((p) => {
    if (filter !== 'all' && p.circle !== filter) return false;
    if (!query) return true;
    const haystack = [p.profile.name, p.profile.handle, p.profile.tagline, ...p.profile.orders.map((o) => formatOrder(o).line)]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <>
      <div className="page-head">
        <h1>Your people</h1>
        <p>
          Profiles others have shared with you. Sort them into circles so a work coffee run and a family visit pull from
          the right list.
        </p>
      </div>

      {peers.length === 0 ? (
        <Empty icon="🫂" title="No one here yet">
          Head to <strong>Share &amp; receive</strong> and paste a code someone sent you, or send them yours first.
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn" onClick={() => loadSamplePeers()}>
              Add three example people
            </button>
          </div>
          <div className="faint" style={{ marginTop: 8 }}>
            Example profiles you can browse, run a coffee run with, and remove whenever you like.
          </div>
        </Empty>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="row-tight">
              <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All <span className="sub">{peers.length}</span>
              </button>
              {CIRCLES.map((c) => {
                const n = peers.filter((p) => p.circle === c.id).length;
                return (
                  <button key={c.id} className="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                    {c.emoji} {c.label} <span className="sub">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="searchbar spacer" style={{ flex: '1 1 200px', maxWidth: 280 }}>
              <input type="search" placeholder="Search people or drinks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {visible.length === 0 ? (
            <Empty icon="🔍" title="Nothing matches that" />
          ) : (
            <div className="grid">
              {visible.map((peer) => (
                <PeerCard
                  key={peer.profile.id}
                  peer={peer}
                  selected={runSelection.includes(peer.profile.id)}
                  onOpen={() => setOpen(peer)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {open && <PeerDetail peer={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PeerCard({ peer, selected, onOpen }: { peer: Peer; selected: boolean; onOpen: () => void }) {
  const { profile } = peer;
  const favorites = profile.orders.filter((o) => o.favorite);
  const headline = favorites[0] ?? profile.orders[0];

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <Avatar emoji={profile.emoji} src={profile.avatar} name={profile.name} size={44} />
        <div style={{ marginRight: 'auto', minWidth: 0 }}>
          <h3 style={{ overflowWrap: 'anywhere' }}>{profile.name || 'Unnamed'}</h3>
          {profile.handle && <div className="faint">{profile.handle}</div>}
        </div>
      </div>

      {profile.tagline && <p className="muted tiny">{profile.tagline}</p>}

      {(profile.diet.length > 0 || profile.allergyNote) && (
        <div className="row-tight" style={{ marginBottom: 8 }}>
          {profile.diet.map((d) => (
            <span key={d} className="tag warn">
              {DIET_FLAGS.find((f) => f.id === d)?.label ?? d}
            </span>
          ))}
          {profile.allergyNote && <span className="tag danger">⚠️ allergy note</span>}
        </div>
      )}

      {headline && (
        <div className="tiny muted" style={{ marginBottom: 10 }}>
          <strong>{headline.favorite ? '★ Go-to: ' : ''}</strong>
          {formatOrder(headline).line}
        </div>
      )}

      <div className="row-tight">
        <span className="tag">{profile.orders.length} order{profile.orders.length === 1 ? '' : 's'}</span>
        <select
          value={peer.circle}
          onChange={(e) => setPeerCircle(profile.id, e.target.value as Circle)}
          style={{ width: 'auto', padding: '3px 8px', fontSize: '0.8rem' }}
          aria-label={`Circle for ${profile.name}`}
        >
          {CIRCLES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn small primary" onClick={onOpen}>
          View card
        </button>
        <button className="btn small" aria-pressed={selected} onClick={() => toggleRunSelection(profile.id)}>
          {selected ? '✓ On the run' : '+ Coffee run'}
        </button>
        <button
          className="btn small ghost danger spacer"
          onClick={() => {
            if (confirm(`Remove ${profile.name || 'this peer'} from your device?`)) removePeer(profile.id);
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/** The card you actually hold up at the counter. */
export function PeerDetail({ peer, onClose }: { peer: Peer; onClose: () => void }) {
  const { profile } = peer;
  return (
    <Modal
      title={`${profile.name || 'Unnamed'}`}
      onClose={onClose}
      footer={
        <>
          <CopyButton text={profileToText(profile)} label="Copy as text" />
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Avatar emoji={profile.emoji} src={profile.avatar} name={profile.name} size={56} />
        <div>
          {profile.handle && <div className="faint">{profile.handle}</div>}
          {profile.tagline && <div className="muted">{profile.tagline}</div>}
        </div>
      </div>

      {profile.allergyNote && (
        <div className="banner danger" style={{ marginBottom: 12 }}>
          <span>⚠️</span>
          <div>
            <strong>Allergy note</strong>
            <div>{profile.allergyNote}</div>
          </div>
        </div>
      )}

      {profile.diet.length > 0 && (
        <div className="row-tight" style={{ marginBottom: 12 }}>
          {profile.diet.map((d) => (
            <span key={d} className="tag warn">
              {DIET_FLAGS.find((f) => f.id === d)?.label ?? d}
            </span>
          ))}
        </div>
      )}

      {profile.dislikes.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          <span>🚫</span>
          <div>
            <strong>Never bring</strong>
            <div>{profile.dislikes.join(' · ')}</div>
          </div>
        </div>
      )}

      {DAYPARTS.map((dp) => {
        const orders = profile.orders.filter((o) => o.daypart === dp.id);
        if (orders.length === 0) return null;
        return (
          <section key={dp.id} style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
              {dp.emoji} {dp.label}
            </h3>
            <div className="stack" style={{ marginTop: 8 }}>
              {orders.map((o) => {
                const f = formatOrder(o);
                return (
                  <div key={o.id} className={`order${o.favorite ? ' fav' : ''}`}>
                    <span className="glyph">{f.brandEmoji}</span>
                    <div className="body">
                      <div className="title">
                        {f.drinkName} <span className="faint">· {f.brandName}</span>
                        {o.favorite && <span className="tag accent" style={{ marginLeft: 6 }}>★ go-to</span>}
                      </div>
                      <div className="line">{f.line}</div>
                      {o.note && <div className="line" style={{ fontStyle: 'italic' }}>“{o.note}”</div>}
                    </div>
                    <CopyButton className="btn ghost small" text={`${f.brandName}: ${f.line}`} label="Copy" />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {profile.orders.length === 0 && <p className="muted">They have not added any drinks yet.</p>}

      <p className="faint" style={{ marginTop: 18 }}>
        Imported {new Date(peer.importedAt).toLocaleDateString()} via {peer.source} · their version {profile.version}
      </p>
    </Modal>
  );
}
