import { useState } from 'react';
import type { Profile } from '../model/types.ts';
import { DIET_FLAGS } from '../model/types.ts';
import { updateMe } from '../model/store.ts';
import { Field, Group, Modal } from './ui.tsx';

const EMOJI_CHOICES = ['☕', '🧋', '🍵', '🥤', '🍸', '🧃', '🍺', '🍷', '🥛', '🧉', '🫖', '🍹', '⚡', '🌞', '🌙', '🐝', '🦊', '🐙', '🌸', '🎧'];

/**
 * Identity and constraints live here rather than on the profile page itself.
 * The home page is something a member *reads* — and hands to a peer — so the
 * granular form belongs in a secondary view it can be opened from.
 */
export function EditProfile({ me, onClose }: { me: Profile; onClose: () => void }) {
  const [dislikeDraft, setDislikeDraft] = useState('');

  const addDislike = () => {
    const value = dislikeDraft.trim();
    if (!value || me.dislikes.includes(value)) return;
    updateMe({ dislikes: [...me.dislikes, value] });
    setDislikeDraft('');
  };

  return (
    <Modal
      title="Edit profile"
      onClose={onClose}
      footer={
        <>
          <span className="faint">Changes save as you type.</span>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <Field label="Name">
              <input type="text" value={me.name} placeholder="What peers should call you" onChange={(e) => updateMe({ name: e.target.value })} />
            </Field>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <Field label="Handle">
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

      <div className="optgroup" style={{ marginTop: 20 }}>
        <header>
          <h4>Constraints</h4>
          <div className="hint">Peers see these as warnings, never buried in small print.</div>
        </header>

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

          <Field label="Allergies, in your own words" hint="This sits at the top of your card and on every coffee-run sheet.">
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
                <button
                  key={d}
                  className="chip on"
                  onClick={() => updateMe({ dislikes: me.dislikes.filter((x) => x !== d) })}
                  aria-label={`Remove ${d}`}
                >
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
                onKeyDown={(e) => e.key === 'Enter' && addDislike()}
                style={{ flex: 1, minWidth: 180 }}
              />
              <button className="btn" disabled={!dislikeDraft.trim()} onClick={addDislike}>
                Add
              </button>
            </div>
          </Group>
        </div>
      </div>
    </Modal>
  );
}
