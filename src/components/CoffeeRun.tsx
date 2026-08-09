import { useMemo, useState } from 'react';
import { DAYPARTS } from '../catalog/index.ts';
import type { Daypart } from '../catalog/types.ts';
import type { Order, Peer, Profile } from '../model/types.ts';
import { CIRCLES, DIET_FLAGS, OCCASIONS, newId } from '../model/types.ts';
import { addRound, clearRunSelection, selectAllForRun, toggleRunSelection } from '../model/store.ts';
import { formatOrder, runSheet } from '../model/format.ts';
import { Avatar, CopyButton, Empty } from './ui.tsx';

/**
 * The reason the whole thing exists: you are going to the shop, and you need
 * everyone's order correct on the first try — including the parts people are
 * too polite to repeat, like an allergy or "no whipped cream, genuinely".
 */
export function CoffeeRun({
  me,
  peers,
  runSelection,
  onToast,
}: {
  me: Profile;
  peers: Peer[];
  runSelection: string[];
  onToast: (msg: string) => void;
}) {
  const [daypart, setDaypart] = useState<Daypart>(guessDaypart());
  const [occasion, setOccasion] = useState<string>('any');
  const [includeMe, setIncludeMe] = useState(true);

  const chosen = peers.filter((p) => runSelection.includes(p.profile.id));

  /** For each person, the single order that best fits the daypart + occasion. */
  const picks = useMemo(() => {
    const people: { who: string; profile: Profile; order: Order | null }[] = [];
    if (includeMe && me.name) people.push({ who: `${me.name} (you)`, profile: me, order: pickOrder(me, daypart, occasion) });
    for (const p of chosen) {
      people.push({ who: p.profile.name || 'Unnamed', profile: p.profile, order: pickOrder(p.profile, daypart, occasion) });
    }
    return people;
  }, [chosen, me, includeMe, daypart, occasion]);

  const withOrders = picks.filter((p): p is { who: string; profile: Profile; order: Order } => p.order !== null);
  const missing = picks.filter((p) => p.order === null);
  const sheet = runSheet(withOrders.map(({ who, order }) => ({ who, order })));

  const plainText = useMemo(() => {
    const lines: string[] = [`Coffee run — ${DAYPARTS.find((d) => d.id === daypart)?.label}`, ''];
    for (const { brand, lines: rows } of sheet) {
      lines.push(brand);
      for (const row of rows) lines.push(`  • ${row}`);
      lines.push('');
    }
    for (const { profile } of withOrders) {
      if (profile.allergyNote) lines.push(`⚠️ ${profile.name}: ${profile.allergyNote}`);
    }
    return lines.join('\n').trim();
  }, [sheet, withOrders, daypart]);

  return (
    <>
      <div className="page-head">
        <h1>Coffee run</h1>
        <p>
          Pick who you are buying for and get one consolidated list, grouped by shop, with everyone's constraints spelled
          out. Read it at the counter or paste it into a message.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Who and when</h2>
          <button className="btn small ghost" onClick={() => selectAllForRun(peers.map((p) => p.profile.id))}>
            Select everyone
          </button>
          <button className="btn small ghost" onClick={clearRunSelection}>
            Clear
          </button>
        </div>

        <div className="stack">
          <div>
            <span className="label" style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 5 }}>Time of day</span>
            <div className="row-tight">
              {DAYPARTS.map((d) => (
                <button key={d.id} className="chip" aria-pressed={daypart === d.id} onClick={() => setDaypart(d.id)}>
                  {d.emoji} {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label" style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 5 }}>Occasion</span>
            <div className="row-tight">
              <button className="chip" aria-pressed={occasion === 'any'} onClick={() => setOccasion('any')}>
                Any
              </button>
              {OCCASIONS.map((o) => (
                <button key={o.id} className="chip" aria-pressed={occasion === o.id} onClick={() => setOccasion(o.id)}>
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label" style={{ fontWeight: 600, fontSize: '0.85rem', display: 'block', marginBottom: 5 }}>People</span>
            <div className="row-tight">
              <button className="chip" aria-pressed={includeMe} onClick={() => setIncludeMe((v) => !v)}>
                <Avatar emoji={me.emoji} src={me.avatar} name={me.name} size={22} /> {me.name || 'You'}{' '}
                <span className="sub">you</span>
              </button>
              {peers.map((p) => (
                <button
                  key={p.profile.id}
                  className="chip"
                  aria-pressed={runSelection.includes(p.profile.id)}
                  onClick={() => toggleRunSelection(p.profile.id)}
                >
                  <Avatar emoji={p.profile.emoji} src={p.profile.avatar} name={p.profile.name} size={22} />{' '}
                  {p.profile.name || 'Unnamed'}
                  <span className="sub">{CIRCLES.find((c) => c.id === p.circle)?.emoji}</span>
                </button>
              ))}
              {peers.length === 0 && <span className="faint">Import some peers first.</span>}
            </div>
          </div>
        </div>
      </div>

      {withOrders.length === 0 ? (
        <Empty icon="🧾" title="Nothing on the list yet">
          Select at least one person who has a drink saved for this time of day.
        </Empty>
      ) : (
        <>
          <div className="card-head" style={{ marginTop: 22 }}>
            <h2>The list</h2>
            <span className="tag">{withOrders.length} drink{withOrders.length === 1 ? '' : 's'}</span>
            <CopyButton className="btn small spacer" text={plainText} label="Copy the list" />
            <button className="btn small" onClick={() => window.print()}>
              Print
            </button>
            <button
              className="btn small primary"
              onClick={() => {
                void addRound({
                  id: newId(),
                  at: Date.now(),
                  buyerId: me.id,
                  buyerName: me.name || 'You',
                  buyerEmoji: me.emoji,
                  buyerAvatar: me.avatar,
                  occasion: occasion === 'any' ? undefined : occasion,
                  source: 'me',
                  recipients: withOrders
                    .filter(({ profile }) => profile.id !== me.id)
                    .map(({ profile, order }) => {
                      const f = formatOrder(order);
                      return {
                        id: profile.id,
                        name: profile.name || 'Unnamed',
                        emoji: profile.emoji,
                        drink: f.line,
                        brand: f.brandName,
                        brandEmoji: f.brandEmoji,
                      };
                    }),
                });
                onToast('Round logged to your feed');
              }}
            >
              I bought this round
            </button>
          </div>

          <div className="stack">
            {sheet.map(({ brand, lines }) => (
              <div key={brand} className="sheet">
                <div className="shop">{brand}</div>
                <ul>
                  {lines.map((line) => {
                    const [who, ...rest] = line.split(': ');
                    const person = withOrders.find((p) => p.who === who);
                    return (
                      <li key={line}>
                        <span className="who">{who}</span>
                        <span className="what">
                          {rest.join(': ')}
                          {person && <Flags profile={person.profile} order={person.order} />}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {withOrders.some(({ profile }) => profile.allergyNote || profile.dislikes.length > 0) && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <h2>Read this before you order</h2>
              </div>
              <div className="stack">
                {withOrders.map(({ who, profile }) =>
                  profile.allergyNote ? (
                    <div key={`a-${profile.id}`} className="banner danger">
                      <span>⚠️</span>
                      <div>
                        <strong>{who}</strong> — {profile.allergyNote}
                      </div>
                    </div>
                  ) : null,
                )}
                {withOrders.map(({ who, profile }) =>
                  profile.dislikes.length > 0 ? (
                    <div key={`d-${profile.id}`} className="banner warn">
                      <span>🚫</span>
                      <div>
                        <strong>{who}</strong> — never bring: {profile.dislikes.join('; ')}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </>
      )}

      {missing.length > 0 && (
        <div className="banner" style={{ marginTop: 16 }}>
          <span>🤷</span>
          <div>
            No {DAYPARTS.find((d) => d.id === daypart)?.label.toLowerCase()} drink on file for{' '}
            <strong>{missing.map((m) => m.who).join(', ')}</strong>
            {occasion !== 'any' && ' at this occasion'}. Ask them to add one, or switch the time of day.
          </div>
        </div>
      )}
    </>
  );
}

function Flags({ profile, order }: { profile: Profile; order: Order }) {
  const tags = formatOrder(order).tags;
  const hits = DIET_FLAGS.filter((f) => profile.diet.includes(f.id));
  if (hits.length === 0 && !profile.allergyNote) return null;
  return (
    <span className="row-tight" style={{ marginLeft: 8, display: 'inline-flex' }}>
      {hits.map((f) => (
        <span key={f.id} className="tag warn flag">
          {f.label}
        </span>
      ))}
      {profile.allergyNote && <span className="tag danger flag">⚠️ allergy</span>}
      {tags.includes('alcohol') && <span className="tag flag">contains alcohol</span>}
    </span>
  );
}

/**
 * Choose the one order to buy for someone: prefer an exact occasion match,
 * then their marked go-to, then anything they have saved for that daypart.
 */
function pickOrder(profile: Profile, daypart: Daypart, occasion: string): Order | null {
  const inDaypart = profile.orders.filter((o) => o.daypart === daypart);
  if (inDaypart.length === 0) return null;
  if (occasion !== 'any') {
    const exact = inDaypart.filter((o) => o.occasions.includes(occasion));
    if (exact.length > 0) return exact.find((o) => o.favorite) ?? exact[0];
  }
  return inDaypart.find((o) => o.favorite) ?? inDaypart[0];
}

function guessDaypart(): Daypart {
  const hour = new Date().getHours();
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}
