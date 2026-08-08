import { useMemo, useState } from 'react';
import { BRANDS, DAYPARTS, drinksByFamily, drinksForDaypart, getBrand, groupsForDrink } from '../catalog/index.ts';
import type { Brand, Daypart, Drink, OptionGroup } from '../catalog/types.ts';
import type { Order, Profile } from '../model/types.ts';
import { OCCASIONS } from '../model/types.ts';
import { draftOrder, saveOrder } from '../model/store.ts';
import { dietConflicts, formatOrder } from '../model/format.ts';
import { Group, Modal } from './ui.tsx';

/**
 * The editor is fully generic: it reads the option groups the catalog declares
 * for the chosen drink and renders a control per `kind`. Adding a brand or an
 * option to the catalog needs no change here.
 */
export function OrderEditor({
  me,
  existing,
  initialDaypart,
  onClose,
}: {
  me: Profile;
  existing?: Order;
  initialDaypart: Daypart;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(existing ?? null);
  const [brandId, setBrandId] = useState<string | null>(existing?.brandId ?? null);
  const [daypart, setDaypart] = useState<Daypart>(existing?.daypart ?? initialDaypart);
  const [query, setQuery] = useState('');

  const brand = brandId ? getBrand(brandId) : undefined;

  // Step 1 — pick a brand. Step 2 — pick a drink. Step 3 — customize.
  if (!brand) {
    return (
      <Modal title="Where is this from?" onClose={onClose}>
        <DaypartPicker value={daypart} onChange={setDaypart} />
        <div className="grid" style={{ marginTop: 16 }}>
          {BRANDS.filter((b) => b.drinks.some((d) => d.dayparts.includes(daypart))).map((b) => (
            <button key={b.id} className="chip" style={{ padding: 14, alignItems: 'flex-start', flexDirection: 'column', gap: 4 }} onClick={() => setBrandId(b.id)}>
              <span style={{ fontWeight: 650 }}>
                {b.emoji} {b.name}
              </span>
              <span className="sub">{b.blurb}</span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  if (!order) {
    const available = drinksForDaypart(brand, daypart);
    const filtered = query
      ? available.filter((d) => (d.name + ' ' + d.family).toLowerCase().includes(query.toLowerCase()))
      : available;
    return (
      <Modal
        title={`${brand.emoji} ${brand.name}`}
        onClose={onClose}
        footer={
          <button className="btn ghost" onClick={() => setBrandId(null)}>
            ← Back to shops
          </button>
        }
      >
        <div className="searchbar">
          <input type="search" placeholder={`Search ${brand.name} drinks…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filtered.length === 0 && <p className="muted" style={{ marginTop: 14 }}>Nothing matches “{query}”.</p>}
        {drinksByFamily(filtered).map(({ family, drinks }) => (
          <div key={family} style={{ marginTop: 16 }}>
            <h4 className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{family}</h4>
            <div className="row-tight" style={{ marginTop: 8 }}>
              {drinks.map((d) => (
                <button key={d.id} className="chip" onClick={() => setOrder(draftOrder(brand.id, d.id, daypart))}>
                  {d.name}
                  {d.seasonal && <span className="tag" style={{ marginLeft: 4 }}>seasonal</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    );
  }

  return <Customizer me={me} brand={brand} order={order} setOrder={setOrder} onClose={onClose} onBack={() => setOrder(null)} />;
}

function DaypartPicker({ value, onChange }: { value: Daypart; onChange: (d: Daypart) => void }) {
  return (
    <Group label="When do you drink this?">
      <div className="row-tight">
        {DAYPARTS.map((d) => (
          <button key={d.id} className="chip" aria-pressed={value === d.id} onClick={() => onChange(d.id)}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>
    </Group>
  );
}

function Customizer({
  me,
  brand,
  order,
  setOrder,
  onClose,
  onBack,
}: {
  me: Profile;
  brand: Brand;
  order: Order;
  setOrder: (o: Order) => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const drink = brand.drinks.find((d) => d.id === order.drinkId) as Drink;
  const groups = useMemo(() => groupsForDrink(brand.id, order.drinkId), [brand.id, order.drinkId]);
  const basic = groups.filter((g) => !g.advanced);
  const advanced = groups.filter((g) => g.advanced);
  const preview = formatOrder(order);
  const conflicts = dietConflicts(me, order);

  const setChoice = (groupId: string, value: string | string[] | number) => {
    setOrder({ ...order, choices: { ...order.choices, [groupId]: value } });
  };

  return (
    <Modal
      title={`${brand.emoji} ${drink.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onBack}>
            ← Different drink
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              saveOrder(order);
              onClose();
            }}
          >
            Save to my profile
          </button>
        </>
      }
    >
      <div className="banner" style={{ marginBottom: 16 }}>
        <span>🗣️</span>
        <div>
          <strong>What a peer would say at the counter</strong>
          <div className="muted" style={{ marginTop: 2 }}>{preview.line}</div>
        </div>
      </div>

      {conflicts.map((c) => (
        <div key={c} className="banner warn" style={{ marginBottom: 10 }}>
          <span>⚠️</span>
          <div>{c}</div>
        </div>
      ))}

      {drink.note && <p className="faint">{drink.note}</p>}

      <DaypartPicker value={order.daypart} onChange={(d) => setOrder({ ...order, daypart: d })} />

      <div className="optgroup" style={{ marginTop: 16 }}>
        <header>
          <h4>Occasions</h4>
          <div className="hint">When this particular order applies.</div>
        </header>
        <div className="row-tight">
          {OCCASIONS.map((o) => {
            const on = order.occasions.includes(o.id);
            return (
              <button
                key={o.id}
                className="chip"
                aria-pressed={on}
                onClick={() =>
                  setOrder({
                    ...order,
                    occasions: on ? order.occasions.filter((x) => x !== o.id) : [...order.occasions, o.id],
                  })
                }
              >
                {o.emoji} {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {basic.map((group) => (
        <GroupControl key={group.id} group={group} value={order.choices[group.id]} onChange={(v) => setChoice(group.id, v)} />
      ))}

      {advanced.length > 0 && (
        <details className="more">
          <summary>More options ({advanced.length})</summary>
          <div style={{ marginTop: 8 }}>
            {advanced.map((group) => (
              <GroupControl key={group.id} group={group} value={order.choices[group.id]} onChange={(v) => setChoice(group.id, v)} />
            ))}
          </div>
        </details>
      )}

      <div className="optgroup">
        <header>
          <h4>Note for whoever is buying</h4>
        </header>
        <textarea
          placeholder="e.g. If they are out of oat milk, skip the drink entirely and get me a black coffee."
          value={order.note ?? ''}
          onChange={(e) => setOrder({ ...order, note: e.target.value })}
        />
      </div>
    </Modal>
  );
}

function GroupControl({
  group,
  value,
  onChange,
}: {
  group: OptionGroup;
  value: string | string[] | number | undefined;
  onChange: (v: string | string[] | number) => void;
}) {
  return (
    <div className="optgroup">
      <header>
        <h4>{group.label}</h4>
        {group.hint && <div className="hint">{group.hint}</div>}
      </header>
      {group.kind === 'single' && (
        <div className="row-tight">
          {group.values?.map((v) => (
            <button key={v.id} className="chip" aria-pressed={value === v.id} onClick={() => onChange(v.id)} title={v.note}>
              <span>
                {v.label}
                {v.note && <span className="sub"> · {v.note}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {group.kind === 'multi' && (
        <div className="row-tight">
          {group.values?.map((v) => {
            const list = Array.isArray(value) ? value : [];
            const on = list.includes(v.id);
            return (
              <button
                key={v.id}
                className="chip"
                aria-pressed={on}
                title={v.note}
                onClick={() => onChange(on ? list.filter((x) => x !== v.id) : [...list, v.id])}
              >
                <span>
                  {v.label}
                  {v.note && <span className="sub"> · {v.note}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {group.kind === 'scale' && (
        <div className="scale">
          {group.values?.map((v) => (
            <button key={v.id} aria-pressed={value === v.id} onClick={() => onChange(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {group.kind === 'count' && (
        <div className="stepper">
          <button onClick={() => onChange(Math.max(group.min ?? 0, Number(value ?? 0) - 1))} aria-label={`One fewer ${group.label}`}>
            −
          </button>
          <span className="value">{Number(value ?? 0)}</span>
          <button onClick={() => onChange(Math.min(group.max ?? 99, Number(value ?? 0) + 1))} aria-label={`One more ${group.label}`}>
            +
          </button>
          {Number(value ?? 0) === 0 && <span className="faint">standard</span>}
        </div>
      )}

      {group.kind === 'text' && (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Say it in your own words…"
        />
      )}
    </div>
  );
}
