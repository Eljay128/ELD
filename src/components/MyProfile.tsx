import { useEffect, useMemo, useRef, useState } from 'react';
import { DAYPARTS, getBrand } from '../catalog/index.ts';
import type { Daypart } from '../catalog/types.ts';
import type { Order, Profile } from '../model/types.ts';
import { DIET_FLAGS, OCCASIONS } from '../model/types.ts';
import { deleteOrder, duplicateOrder, exportBackup, toggleFavorite } from '../model/store.ts';
import { dietConflicts, formatOrder, profileToText } from '../model/format.ts';
import { encodeProfile } from '../model/share.ts';
import { OrderEditor } from './OrderEditor.tsx';
import { EditProfile } from './EditProfile.tsx';
import { Avatar, Empty, copyText } from './ui.tsx';

type Filter = Daypart | 'all';

/**
 * The home page is a profile, not a form: identity first, then the numbers that
 * describe it, then the drinks themselves. Everything granular — the identity
 * fields, dietary flags, the never-bring list — lives behind "Edit profile", so
 * the page a member actually looks at (and hands to a peer) stays readable.
 */
export function MyProfile({
  me,
  peerCount,
  onToast,
  onGoToShare,
}: {
  me: Profile;
  peerCount: number;
  onToast: (msg: string) => void;
  onGoToShare: () => void;
}) {
  const [editing, setEditing] = useState<{ order?: Order; daypart: Daypart } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const metrics = useMemo(() => {
    const shops = new Set(me.orders.map((o) => o.brandId));
    const covered = DAYPARTS.filter((d) => me.orders.some((o) => o.daypart === d.id && o.favorite)).length;
    return { drinks: me.orders.length, shops: shops.size, covered };
  }, [me.orders]);

  const visible = filter === 'all' ? me.orders : me.orders.filter((o) => o.daypart === filter);
  const named = me.name.trim();

  return (
    <>
      {/* --- Identity ---------------------------------------------------- */}
      <header className="identity">
        <button
          className="avatar"
          onClick={() => setEditingProfile(true)}
          aria-label="Edit profile"
          title="Edit profile"
        >
          <Avatar emoji={me.emoji} src={me.avatar} name={me.name} size={84} />
        </button>

        <div className="identity-text">
          <h1>{named || 'Your profile'}</h1>
          <div className="identity-sub">
            {me.handle && <span className="handle">{me.handle}</span>}
            {me.tagline ? (
              <span className="tagline">{me.tagline}</span>
            ) : (
              <span className="tagline faint">
                {named ? 'Add a tagline so peers know your one rule.' : 'Add your name so a peer knows whose order this is.'}
              </span>
            )}
          </div>

          {(me.diet.length > 0 || me.allergyNote || me.dislikes.length > 0) && (
            <div className="row-tight constraint-row">
              {me.allergyNote && <span className="tag danger">⚠️ {me.allergyNote}</span>}
              {me.diet.map((d) => (
                <span key={d} className="tag warn">
                  {DIET_FLAGS.find((f) => f.id === d)?.label ?? d}
                </span>
              ))}
              {me.dislikes.map((d) => (
                <span key={d} className="tag">
                  🚫 {d}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* --- Action row ------------------------------------------------ */}
        <div className="action-row">
          <button className="btn primary" onClick={() => setEditingProfile(true)}>
            Edit profile
          </button>
          <button className="btn" onClick={onGoToShare}>
            Share profile
          </button>
          <OverflowMenu me={me} onToast={onToast} onAddDrink={() => setEditing({ daypart: guessDaypart() })} />
        </div>
      </header>

      {/* --- Metrics ----------------------------------------------------- */}
      <div className="metrics" role="group" aria-label="Profile totals">
        <Metric value={metrics.drinks} label="Drinks saved" />
        <Metric value={metrics.shops} label="Shops covered" />
        <Metric value={`${metrics.covered}/4`} label="Go-tos set" hint={metrics.covered < 4 ? 'A go-to is what a peer buys when nobody asks' : 'Every part of the day is covered'} />
        <Metric value={peerCount} label="People sharing with you" hint="Profiles others have handed to you" />
      </div>

      {/* --- Segmented navigation --------------------------------------- */}
      <nav className="segmented" aria-label="Filter drinks by time of day">
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <span className="seg-count">{me.orders.length}</span>
        </button>
        {DAYPARTS.map((d) => {
          const n = me.orders.filter((o) => o.daypart === d.id).length;
          return (
            <button key={d.id} aria-pressed={filter === d.id} onClick={() => setFilter(d.id)}>
              <span aria-hidden="true">{d.emoji}</span> {d.label} <span className="seg-count">{n}</span>
            </button>
          );
        })}
      </nav>

      {/* --- Content grid ------------------------------------------------ */}
      {filter === 'all' ? (
        DAYPARTS.map((dp) => {
          const orders = me.orders.filter((o) => o.daypart === dp.id);
          return (
            <section key={dp.id}>
              <div className="daypart-head">
                <h2>
                  {dp.emoji} {dp.label}
                </h2>
                <span className="blurb">{dp.blurb}</span>
                <button className="btn small spacer" onClick={() => setEditing({ daypart: dp.id })}>
                  + Add
                </button>
              </div>
              {orders.length === 0 ? (
                <Empty icon={dp.emoji} title={`Nothing for ${dp.label.toLowerCase()} yet`}>
                  <button className="btn primary" style={{ marginTop: 10 }} onClick={() => setEditing({ daypart: dp.id })}>
                    Add {article(dp.label)} {dp.label.toLowerCase()} drink
                  </button>
                </Empty>
              ) : (
                <div className="drink-grid">
                  {orders.map((order) => (
                    <DrinkCard key={order.id} me={me} order={order} onEdit={() => setEditing({ order, daypart: order.daypart })} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      ) : (
        <section>
          <div className="daypart-head">
            <h2>
              {DAYPARTS.find((d) => d.id === filter)?.emoji} {DAYPARTS.find((d) => d.id === filter)?.label}
            </h2>
            <span className="blurb">{DAYPARTS.find((d) => d.id === filter)?.blurb}</span>
            <button className="btn small spacer" onClick={() => setEditing({ daypart: filter })}>
              + Add
            </button>
          </div>
          {visible.length === 0 ? (
            <Empty icon="🥤" title="Nothing here yet">
              <button className="btn primary" style={{ marginTop: 10 }} onClick={() => setEditing({ daypart: filter })}>
                Add a drink
              </button>
            </Empty>
          ) : (
            <div className="drink-grid">
              {visible.map((order) => (
                <DrinkCard key={order.id} me={me} order={order} onEdit={() => setEditing({ order, daypart: order.daypart })} />
              ))}
            </div>
          )}
        </section>
      )}

      {editing && <OrderEditor me={me} existing={editing.order} initialDaypart={editing.daypart} onClose={() => setEditing(null)} />}
      {editingProfile && <EditProfile me={me} onClose={() => setEditingProfile(false)} />}
    </>
  );
}

/**
 * Stat tile. The value carries the weight, the label stays recessive, and no
 * tile gets a colour of its own — these are counts, not categories, so hue here
 * would imply a distinction that does not exist.
 */
function Metric({ value, label, hint }: { value: number | string; label: string; hint?: string }) {
  return (
    <div className="metric" title={hint}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

/** Extended account operations, kept out of the primary action row. */
function OverflowMenu({ me, onToast, onAddDrink }: { me: Profile; onToast: (msg: string) => void; onAddDrink: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (label: string, fn: () => Promise<boolean> | boolean) => {
    setOpen(false);
    const ok = await fn();
    onToast(ok ? label : 'That did not work — try again.');
  };

  return (
    <div className="menu-wrap" ref={wrap}>
      <button
        className="btn icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More profile actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onAddDrink(); }}>
            Add a drink
          </button>
          <button role="menuitem" onClick={() => run('Profile copied as text', () => copyText(profileToText(me)))}>
            Copy profile as text
          </button>
          <button role="menuitem" onClick={() => run('Share code copied', () => copyText(encodeProfile(me)))}>
            Copy share code
          </button>
          <hr />
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
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
        </div>
      )}
    </div>
  );
}

function DrinkCard({ me, order, onEdit }: { me: Profile; order: Order; onEdit: () => void }) {
  const f = formatOrder(order);
  const conflicts = dietConflicts(me, order);
  const brand = getBrand(order.brandId);

  return (
    <article className={`drink-card${order.favorite ? ' fav' : ''}`}>
      <div className="drink-top">
        <span className="drink-glyph" aria-hidden="true">{f.brandEmoji}</span>
        <div className="drink-heading">
          <h3>{f.drinkName}</h3>
          <div className="faint">{brand?.name ?? f.brandName}</div>
        </div>
        <button
          className="btn ghost small star"
          aria-pressed={order.favorite}
          title={order.favorite ? 'Remove as go-to' : 'Make this my go-to'}
          onClick={() => toggleFavorite(order.id)}
        >
          {order.favorite ? '★' : '☆'}
        </button>
      </div>

      {order.favorite && <span className="tag accent">★ go-to</span>}

      <p className="drink-line">{f.line}</p>

      {order.note && <p className="drink-note">“{order.note}”</p>}

      {order.occasions.length > 0 && (
        <div className="row-tight">
          {order.occasions.map((id) => {
            const o = OCCASIONS.find((x) => x.id === id);
            return o ? (
              <span key={id} className="tag">
                {o.emoji} {o.label}
              </span>
            ) : null;
          })}
        </div>
      )}

      {conflicts.map((c) => (
        <div key={c} className="tag warn" style={{ whiteSpace: 'normal', textAlign: 'left' }}>
          ⚠️ {c}
        </div>
      ))}

      <div className="drink-acts">
        <button className="btn small" onClick={onEdit}>
          Edit
        </button>
        <button className="btn small ghost" title="Duplicate" onClick={() => duplicateOrder(order.id)}>
          Duplicate
        </button>
        <button
          className="btn small ghost danger spacer"
          onClick={() => {
            if (confirm(`Delete “${f.drinkName}” from your profile?`)) deleteOrder(order.id);
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

/** "an evening drink", not "a evening drink". */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function guessDaypart(): Daypart {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}
