# Pourfolio

**Your complete beverage preference profile, shared peer-to-peer.**

Build a detailed profile of what you drink — morning, day, evening, and adult — with the
real customization options from the shops you actually go to, then hand it to friends,
family, and coworkers. When someone does a coffee run, they get your order right the first
time, including the parts you are too polite to repeat.

There is no server, no account, and no database. A profile is a self-contained code that
travels as a link, a QR code, a file, or a direct browser-to-browser connection.

---

## The home page

The profile page is something you *read* and hand to someone, so it is laid out as a
profile rather than a form:

- **Identity** — the avatar is the focal point (a photo if you upload one, your emoji
  otherwise), with display name, handle and tagline.
  Allergies and dietary flags sit right beneath, because that is safety information and
  must not be one click away.
- **Action row** — Edit profile, Share profile, and an overflow menu for the extended
  operations (copy as text, copy share code, download a backup).
- **Metrics** — four equal-width tiles: drinks saved, shops covered, go-tos set (out of the
  four dayparts), and people sharing with you.
- **Segmented navigation** — All / Morning / Day / Evening / Adult, filtering the grid
  below. It is a connected track rather than pills, so it never reads as the same control
  as the top-level tabs.
- **Content grid** — the drinks themselves, as cards.

Everything granular — identity fields, dietary flags, the never-bring list — lives behind
**Edit profile** in a secondary view, so the primary card stays scannable.

---

## What it does

**A profile with four time-of-day sections.** Morning, Day, Evening, and Adult. Each holds
as many saved orders as you want, and one order per section can be marked as your go-to —
the thing to buy if nobody asks.

**Real menu customization, not a text box.** 10 venues, 243 drinks, 903 distinct
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

**A rounds feed.** Who bought what for whom, newest first, with live relative timestamps.
Log a round from the coffee-run sheet in one click, or by hand. See below for exactly how
"live" it is.

**Four ways to share.**

| Method | Good for |
| --- | --- |
| Share link | Messaging, email, anywhere a URL goes |
| QR code | In person, phone to phone |
| `.pourfolio` file | Backups, AirDrop, attachments |
| Direct swap (WebRTC) | Both people get each other's profile in one handshake |

---

## Profile pictures

A picture is optional; the emoji is always there as the fallback, and stays the compact
identity in dense places like the run sheet.

The constraint that shapes the feature: **a profile travels as its own share code**, so the
picture has to live inside that code. A phone photo would produce a multi-megabyte share
string. Every upload is therefore centre-cropped to a square, downscaled to 128px, and
re-encoded as WebP (JPEG where WebP is unavailable) before it is ever stored — typically
3–6 KB, which keeps the profile pasteable as a link.

That is still far past what a QR code can hold (2,953 characters), so when you have a
picture set the **QR carries the photo-less version of your profile and says so on screen**.
The link, the file, and the direct swap all include it.

---

## The rounds feed, and what "live" honestly means

The feed shows peers and friends buying each other drinks. Three things are genuinely
real-time:

| Where | How live | Mechanism |
| --- | --- | --- |
| This window | Instant | Local state |
| Your other tabs and windows | Instant, no polling | The `storage` event |
| A connected peer | Instant while the connection is open | The WebRTC data channel |

Timestamps re-render on a timer, so "just now" becomes "4 min ago" while you watch.

**What it is not** is an always-on global timeline. Delivering activity to someone who is
not currently connected requires a server to hold it until they come back, and Pourfolio
deliberately has none. The feed states this in the app rather than implying a connection
that is not there. Rounds otherwise move the same way profiles do — as a code you hand
over (`PFR1.…`), merged by id so exchanging twice never duplicates.

Rounds are stored as written rather than recomputed: if a peer later edits their profile,
the round still records what was actually in the cup that day.

---

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
npm test         # builds, then runs the end-to-end smoke test
npm run check    # validates the catalog and sample profiles
npm run single   # folds the build into one self-contained HTML file
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
    types.ts          Profile, Order, Peer, Round, occasions, dietary flags
    avatar.ts         Crop, downscale and re-encode a photo to share-code size
    store.ts          localStorage-backed state; no network anywhere in it
    share.ts          Encode/decode, link building, inbound-link parsing
    p2p.ts            WebRTC exchange with manual signalling
    format.ts         Choices → the sentence you say at the counter
  components/
    MyProfile.tsx     The profile home: identity, metrics, segmented nav, grid
    EditProfile.tsx   Identity and constraints, kept off the primary card
    OrderEditor.tsx   Generic option renderer, driven entirely by the catalog
    CoffeeRun.tsx     Consolidated buy-list grouped by shop
    Peers.tsx         Imported profiles and the card you read at the counter
    Share.tsx         Codes, links, QR, file import, camera scanning
    P2P.tsx           The direct browser-to-browser swap
    Feed.tsx          The rounds feed, logging, and peer activity sync
    Settings.tsx      Data, catalog provenance, privacy, reset
scripts/
  smoke.mjs           End-to-end test driving two independent browsers
  check-catalog.ts    Catches option ids that reference nothing
  build-single-file.mjs  Inlines the build into one portable HTML file
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
re-imports, and damaged-code handling, plus the profile metrics, segmented filter and
overflow menu, the photo pipeline, the feed, and cross-window live sync (a second page
sharing one localStorage — exactly what a second tab is). 45 checks, no console errors
tolerated.

```bash
npm test        # 45 browser checks
npm run check   # catalog consistency
```

`check-catalog.ts` exists because a mistyped option id does not throw — it silently
vanishes from the rendered order, so the profile looks fine and quietly means something
else. It caught exactly that bug on its first run.

---

## A note on the menu data

Menus change constantly and vary by region, so treat the catalog as a well-stocked starting
point rather than a live menu feed. Option sets were assembled from each chain's published
menu and customization guidance (sources are listed per brand in Settings, and in the
`sources` field of each catalog file). Nothing here is affiliated with or endorsed by any
of the businesses named — the brand names identify menus so people can describe orders
accurately.
