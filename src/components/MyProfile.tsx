import { useState } from 'react';
import { DAYPARTS } from '../catalog/index.ts';
import type { Daypart } from '../catalog/types.ts';
import type { Order, Profile } from '../model/types.ts';
import { DIET_FLAGS } from '../model/types.ts';
import { deleteOrder, duplicateOrder, toggleFavorite, updateMe } from '../model/store.ts';
import { dietConflicts, formatOrder } from '../model/format.ts';
import { OrderEditor } from './OrderEditor.tsx';
import { Empty, Field, Group } from './ui.tsx';

const EMOJI_CHOICES = ['☕', '🧋', '🍵', '🥤', '🍸', '🧃', '🍺', '🍷', '🥛', '🧉', '🫖', '🍹', '⚡', '🌞', '🌙', '🐝', '🦊', '🐙', '🌸', '🎧'];

/** "an evening drink", not "a evening drink". */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function MyProfile({ me }: { me: Profile }) {
  const [editing, setEditing] = useState<{ order?: Order; daypart: Daypart } | null>(null);
  const [dislikeDraft, setDislikeDraft] = useState('');

  return (
    <>
      <div className="page-head">
        <h1>Your profile</h1>
        <p>
          Everything here stays on this device until you hand someone a code. Fill in as much or as little as you like —
          one favourite per time of day is enough to be genuinely useful to a peer.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Who you are</h2>
        </div>
        <div className="stack">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Name">
                <input type="text" value={me.name} placeholder="What peers should call you" onChange={(e) => updateMe({ name: e.target.value })} />
              </Field>
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <Field label="Handle (optional)">
                <input type="text" value={me.handle ?? ''} placeholder="@you" onChange={(e) => updateMe({ handle: e.target.value })} />
              </Field>
            </div>
          </div>

          <Field label="Tagline" hint="One line peers see under your name.">
            <input
              type="text"
              value={me.tagline ?? ''}
              placeholder="Oat milk or nothing. Decaf after 2pm."
              onChange={(e) => updateMe({ tagline: e.target.value })}
            />
          </Field>

          <Group label="Your icon">
            <div className="row-tight">
              {EMOJI_CHOICES.map((e) => (
                <button key={e} className="chip" aria-pressed={me.emoji === e} onClick={() => updateMe({ emoji: e })} aria-label={`Icon ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </Group>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Constraints</h2>
          <span className="faint">Shown as warnings to peers, never hidden in small print.</span>
        </div>
        <div className="stack">
          <Group label="Dietary flags">
            <div className="row-tight">
              {DIET_FLAGS.map((f) => {
                const on = me.diet.includes(f.id);
                return (
                  <button
                    key={f.id}
                    className="chip"
                    aria-pressed={on}
                    onClick={() => updateMe({ diet: on ? me.diet.filter((d) => d !== f.id) : [...me.diet, f.id] })}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Group>

          <Field label="Allergies, in your own words" hint="Peers see this at the top of your card. Be as specific as you need to be.">
            <input
              type="text"
              value={me.allergyNote ?? ''}
              placeholder="Severe tree-nut allergy — no almond or macadamia, and ask about shared equipment."
              onChange={(e) => updateMe({ allergyNote: e.target.value })}
            />
          </Field>

          <Group label="Never bring me">
            <div className="row-tight" style={{ marginBottom: 8 }}>
              {me.dislikes.map((d) => (
                <button key={d} className="chip on" onClick={() => updateMe({ dislikes: me.dislikes.filter((x) => x !== d) })} title="Remove">
                  {d} ✕
                </button>
              ))}
              {me.dislikes.length === 0 && <span className="faint">Nothing listed yet.</span>}
            </div>
            <div className="row">
              <input
                type="text"
                value={dislikeDraft}
                placeholder="Anything with coconut"
                onChange={(e) => setDislikeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dislikeDraft.trim()) {
                    updateMe({ dislikes: [...me.dislikes, dislikeDraft.trim()] });
                    setDislikeDraft('');
                  }
                }}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button
                className="btn"
                disabled={!dislikeDraft.trim()}
                onClick={() => {
                  updateMe({ dislikes: [...me.dislikes, dislikeDraft.trim()] });
                  setDislikeDraft('');
                }}
              >
                Add
              </button>
            </div>
          </Group>
        </div>
      </div>

      {DAYPARTS.map((dp) => {
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
              <Empty icon={dp.emoji} title={`No ${dp.label.toLowerCase()} drinks yet`}>
                <button className="btn primary" style={{ marginTop: 8 }} onClick={() => setEditing({ daypart: dp.id })}>
                  Add {article(dp.label)} {dp.label.toLowerCase()} drink
                </button>
              </Empty>
            ) : (
              <div className="stack">
                {orders.map((order) => (
                  <OrderRow key={order.id} me={me} order={order} onEdit={() => setEditing({ order, daypart: order.daypart })} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {editing && (
        <OrderEditor me={me} existing={editing.order} initialDaypart={editing.daypart} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function OrderRow({ me, order, onEdit }: { me: Profile; order: Order; onEdit: () => void }) {
  const f = formatOrder(order);
  const conflicts = dietConflicts(me, order);
  return (
    <div className={`order${order.favorite ? ' fav' : ''}`}>
      <span className="glyph">{f.brandEmoji}</span>
      <div className="body">
        <div className="title">
          {f.drinkName} <span className="faint">· {f.brandName}</span>
          {order.favorite && <span className="tag accent" style={{ marginLeft: 6 }}>★ go-to</span>}
        </div>
        <div className="line">{f.line}</div>
        {order.note && <div className="line" style={{ fontStyle: 'italic' }}>“{order.note}”</div>}
        {conflicts.length > 0 && (
          <div className="row-tight" style={{ marginTop: 6 }}>
            {conflicts.map((c) => (
              <span key={c} className="tag warn">⚠️ {c}</span>
            ))}
          </div>
        )}
      </div>
      <div className="acts">
        <button className="btn ghost small" title={order.favorite ? 'Unset as go-to' : 'Make this my go-to'} onClick={() => toggleFavorite(order.id)}>
          {order.favorite ? '★' : '☆'}
        </button>
        <button className="btn ghost small" onClick={onEdit}>Edit</button>
        <button className="btn ghost small" title="Duplicate" onClick={() => duplicateOrder(order.id)}>⧉</button>
        <button
          className="btn ghost small"
          title="Delete"
          onClick={() => {
            if (confirm(`Delete “${f.drinkName}” from your profile?`)) deleteOrder(order.id);
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
