# Pourfolio

**Your complete beverage preference profile, shared peer-to-peer.**

Build a detailed profile of what you drink — morning, day, evening, and adult — with the
real customization options from the shops you actually go to, then hand it to friends,
family, and coworkers. When someone does a coffee run, they get your order right the first
time, including the parts you are too polite to repeat.

There is no server, no account, and no database. A profile is a self-contained code that
travels as a link, a QR code, a file, or a direct browser-to-browser connection.

---

## What it does

**A profile with four time-of-day sections.** Morning, Day, Evening, and Adult. Each holds
as many saved orders as you want, and one order per section can be marked as your go-to —
the thing to buy if nobody asks.

**Real menu customization, not a text box.** 10 venues, 243 drinks, 1,072 distinct
customization options, all structured. Starbucks gives you five sizes, nine milks, both
espresso roasts, pump counts, cold foams, and the full syrup wall. Dunkin' distinguishes
sweetened *swirls* from unsweetened *shots*, because that distinction is the difference
between the drink you wanted and the one you did not. Boba shops take sugar and ice as
percentages. The bar covers spirits, wine, and beer alongside a flavour-direction profile,
so someone can pick for you.

**Constraints that travel with the profile.** Dietary flags, an allergy note in your own
words, and a "never bring me" list. These render as warnings on your peer's screen and on
the coffee-run sheet — never buried in small print. If your own saved order contradicts a
flag you set, the editor says so rather than silently blocking the save.

**A coffee run sheet.** Pick who you are buying for and the time of day, and get one
consolidated list grouped by shop, with every allergy and hard-no called out above it. Copy
it to a message or read it at the counter.

**Four ways to share.**

| Method | Good for |
| --- | --- |
| Share link | Messaging, email, anywhere a URL goes |
| QR code | In person, phone to phone |
| `.pourfolio` file | Backups, AirDrop, attachments |
| Direct swap (WebRTC) | Both people get each other's profile in one handshake |

---

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
npm test         # builds, then runs the end-to-end smoke test
```

The built output in `dist/` is fully static and makes **no network requests at all** — put
it on any static host, or open it from a local file.

---

## How sharing works

A profile is packed into short-keyed JSON, deflated, and base64url-encoded, producing a
string like `PF1.XZHdatwwEIVfRejaDuvdtdP6…`. A typical profile is 500–900 characters.

```
Profile ──▶ short-keyed JSON ──▶ deflate ──▶ base64url ──▶ "PF1.…"
```

Whoever holds that string holds the profile. Nothing is looked up, so nothing can go
offline or get deleted out from under you. Re-importing the same person is safe: the copy
with the higher version number wins, so passing a link around a group chat converges rather
than duplicating.

**The direct swap** is the literal peer-to-peer path. Two browsers trade one blob of text
each — over any channel you already have — and connect directly over a WebRTC data channel
with no signalling server. Both sides come away with the other's profile from a single
round. A public STUN server is used only to discover a route between two NATs; no profile
data passes through it, and `iceServers: []` in `src/model/p2p.ts` restricts it to the
local network.

### Privacy, stated plainly

- No account, no sign-in, no server storing your profile.
- No analytics, no third-party requests.
- **Share codes are compressed, not encrypted.** Anyone who receives one — or reads it over
  your shoulder — can read the profile. Share it the way you would share a phone number.
- Everything lives in this browser's local storage. Clearing site data loses it, so
  Settings has a backup export.

---

## Layout

```
src/
  catalog/            Static reference data: what can be ordered, and how
    types.ts          The five option kinds every brand is described with
    shared.ts         Option groups reused across brands (milk, sweetener, ice…)
    starbucks.ts      Deepest option tree — the reference implementation
    dunkin.ts         Swirls vs. shots modelled separately
    chains.ts         Dutch Bros, Tim Hortons, local café, fast food & convenience
    teahouse.ts       Boba (percentage sugar/ice) and juice bars
    bar.ts            Spirits, wine, beer, cocktails, and zero-proof counterparts
    home.ts           Hosting: what to pour when someone visits
  model/
    types.ts          Profile, Order, Peer, occasions, dietary flags
    store.ts          localStorage-backed state; no network anywhere in it
    share.ts          Encode/decode, link building, inbound-link parsing
    p2p.ts            WebRTC exchange with manual signalling
    format.ts         Choices → the sentence you say at the counter
  components/         React UI, one file per screen
scripts/smoke.mjs     End-to-end test driving two independent browsers
```

### Adding a shop

The editor is fully generic — it renders whatever the catalog declares. A new brand needs
no UI changes:

```ts
export const myShop: Brand = {
  id: 'my-shop', name: 'My Shop', short: 'My Shop', emoji: '🥤', hue: 200,
  blurb: 'What makes ordering here different.',
  groups: [
    { id: 'size', label: 'Size', kind: 'single', values: vals('Small', 'Large'), fallback: 'small' },
    milkGroup(['whole-milk', 'oat-milk'], 'whole-milk'),
  ],
  drinks: [
    { id: 'house-coffee', name: 'House Coffee', family: 'Coffee',
      dayparts: ['morning', 'day'], groups: ['size', 'milk'] },
  ],
};
```

Then add it to `BRANDS` in `src/catalog/index.ts`. The five option kinds are `single`,
`multi`, `count`, `scale`, and `text`; every drink also gets a free-text note field
automatically, for whatever the structure did not anticipate.

---

## Testing

`scripts/smoke.mjs` drives two separate browser contexts — "Ada" and "Bo" — through the
real flow, because two contexts mean two localStorages, which is exactly the peer boundary
the app is built around. It covers profile building, dietary-conflict warnings, persistence
across reload, share-link import, allergy propagation, the run sheet, idempotent
re-imports, and damaged-code handling. 26 checks, no console errors tolerated.

```bash
npm test
```

---

## A note on the menu data

Menus change constantly and vary by region, so treat the catalog as a well-stocked starting
point rather than a live menu feed. Option sets were assembled from each chain's published
menu and customization guidance (sources are listed per brand in Settings, and in the
`sources` field of each catalog file). Nothing here is affiliated with or endorsed by any
of the businesses named — the brand names identify menus so people can describe orders
accurately.
