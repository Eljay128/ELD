import type { Order, Profile, Round } from './types.ts';
import type { Daypart } from '../catalog/types.ts';

/**
 * Three example people, so a first-time member can see what a received profile
 * actually looks like — and try a coffee run — before anyone has shared with
 * them. They import through the ordinary peer path and can be removed like any
 * other peer; nothing here is special-cased elsewhere in the app.
 *
 * Between them they exercise the parts that matter: a hard allergy, a
 * caffeine-sensitive evening drinker, an alcohol-free adult profile, and two
 * people who go to different shops.
 */

function order(
  id: string,
  brandId: string,
  drinkId: string,
  daypart: Daypart,
  occasions: string[],
  choices: Order['choices'],
  favorite = false,
  note?: string,
): Order {
  const at = Date.UTC(2026, 0, 12);
  return { id, brandId, drinkId, daypart, occasions, choices, favorite, note, createdAt: at, updatedAt: at };
}

export const SAMPLE_PEERS: Profile[] = [
  {
    id: 'sample-priya',
    name: 'Priya',
    handle: '@priya',
    emoji: '🧋',
    tagline: 'Half sweet, light ice, and I will notice if it is not.',
    diet: ['nut'],
    allergyNote: 'Tree nut allergy — no almond milk, no macadamia syrup, and please ask if the steam wand is shared.',
    dislikes: ['Anything with coconut', 'Whipped cream'],
    version: 4,
    updatedAt: Date.UTC(2026, 0, 12),
    orders: [
      order(
        'sample-priya-1',
        'starbucks',
        'caramel-macchiato',
        'morning',
        ['everyday', 'work'],
        { size: 'grande', temp: 'iced', milk: 'oat-milk', espresso_roast: 'blonde', shots: 1, syrup: ['vanilla'], syrup_pumps: 2, topping: ['no-whip'] },
        true,
        'If they are out of oat milk, get me a black iced coffee instead — do not substitute almond.',
      ),
      order(
        'sample-priya-2',
        'teahouse',
        'classic-milk-tea',
        'day',
        ['treat', 'hot-weather'],
        { shop: 'any-boba-shop', size: 'medium-20-oz', temp: 'cold', tea_base: 'black', creamer: 'fresh-milk', milk: 'oat-milk', sweetness: '50-half-sweet', ice_pct: '25-light-ice', toppings: ['tapioca'], topping_amount: 'regular' },
      ),
      order(
        'sample-priya-3',
        'bar',
        'aperol-spritz',
        'adult',
        ['celebration', 'brunch'],
        { abv: 'full', spirit: 'aperitivo', flavor_profile: ['bitter', 'refreshing-long'], sweetness_level: 'off-dry', serve: 'tall-with-mixer', garnish: ['orange-peel'] },
        true,
      ),
    ],
  },
  {
    id: 'sample-marcus',
    name: 'Marcus',
    emoji: '🍺',
    tagline: 'Large, cream, two sugars. Do not overthink it.',
    diet: [],
    dislikes: [],
    version: 2,
    updatedAt: Date.UTC(2026, 0, 10),
    orders: [
      order(
        'sample-marcus-1',
        'dunkin',
        'original-blend-hot',
        'morning',
        ['everyday', 'commute'],
        { size: 'large', temp: 'hot', milk: 'cream', dairy_amount: 'regular', caffeine: 'regular', sweetener: ['sugar'], sweetener_count: 2, turbo: 'no' },
        true,
      ),
      order(
        'sample-marcus-2',
        'fast-food',
        'diet-soda',
        'day',
        ['everyday', 'work'],
        { chain: 'mcdonald-s-mccafe', size: 'large', temp: 'iced', ice_type: 'pellet-nugget-ice', ice: 'extra-ice' },
        true,
      ),
      order(
        'sample-marcus-3',
        'bar',
        'beer-draft',
        'adult',
        ['everyday', 'celebration'],
        { abv: 'full', flavor_profile: ['refreshing-long'], beer_style: ['pilsner', 'ipa-hazy-new-england'], hard_no: ['shots'], occasion_note: 'two-drink-maximum' },
        true,
        'If there is a local hazy on tap, that. Otherwise whatever pilsner they have.',
      ),
    ],
  },
  {
    id: 'sample-eleanor',
    name: 'Eleanor',
    emoji: '🫖',
    tagline: 'Decaf after noon, and never anything with alcohol.',
    diet: ['decaf', 'zero-proof', 'sugar-free'],
    allergyNote: '',
    dislikes: ['Anything fizzy', 'Very hot drinks — let it cool first'],
    version: 3,
    updatedAt: Date.UTC(2026, 0, 11),
    orders: [
      order(
        'sample-eleanor-1',
        'home',
        'black-tea',
        'morning',
        ['everyday', 'hosting'],
        { vessel: 'my-usual-mug', temp: 'hot', brew_method: 'kettle-and-a-tea-bag', milk: 'whole-milk', milk_amount: 'a-splash', caffeine: 'regular', steep: 'strong-5-minutes', addition: [], sweetener: ['none'] },
        true,
        'Take the bag out and leave it on the saucer, please.',
      ),
      order(
        'sample-eleanor-2',
        'home',
        'herbal-tea',
        'evening',
        ['everyday', 'nightcap', 'hosting'],
        { vessel: 'any-mug', temp: 'hot', brew_method: 'loose-leaf-steeped-properly', milk: 'no-milk', milk_amount: 'none', steep: 'standard-3-minutes', addition: ['honey', 'lemon'], sweetener: ['none'], stock: 'yes-please-i-will-always-want-this' },
        true,
      ),
      order(
        'sample-eleanor-3',
        'bar',
        'na-spritz',
        'adult',
        ['celebration', 'hosting'],
        { abv: 'never', spirit: 'na-spirit', flavor_profile: ['bitter', 'refreshing-long'], sweetness_level: 'dry', serve: 'tall-with-mixer', garnish: ['orange-peel'], hard_no: ['shots'] },
        true,
        'A proper zero-proof drink in a real glass, not a soda water with a lime in it.',
      ),
    ],
  },
];

/**
 * Example activity, so the feed shows what it is for before any real rounds
 * exist. Timed relative to now so the feed reads as recent rather than frozen
 * at some date in the past, and tagged `sample` so the UI can label them
 * honestly rather than passing them off as real.
 */
export function sampleRounds(): Round[] {
  const min = 60_000;
  const now = Date.now();
  return [
    {
      id: 'sample-round-1',
      at: now - 14 * min,
      buyerId: 'sample-marcus',
      buyerName: 'Marcus',
      buyerEmoji: '🍺',
      source: 'sample',
      occasion: 'meeting',
      note: 'Standup ran long. Rescue mission.',
      recipients: [
        {
          id: 'sample-priya',
          name: 'Priya',
          emoji: '🧋',
          drink: 'Grande Iced Caramel Macchiato — Oat milk, Blonde Espresso, 1 shot, Vanilla, 2 pumps, No whipped cream',
          brand: 'Starbucks',
          brandEmoji: '🟢',
        },
        {
          id: 'sample-eleanor',
          name: 'Eleanor',
          emoji: '🫖',
          drink: 'Black tea — My usual mug, brew: Kettle and a tea bag, Whole milk, milk: A splash, steep: Strong — 5 minutes',
          brand: 'At home & hosting',
          brandEmoji: '🏠',
        },
      ],
    },
    {
      id: 'sample-round-2',
      at: now - 3 * 60 * min,
      buyerId: 'sample-priya',
      buyerName: 'Priya',
      buyerEmoji: '🧋',
      source: 'sample',
      occasion: 'treat',
      recipients: [
        {
          id: 'sample-marcus',
          name: 'Marcus',
          emoji: '🍺',
          drink: 'Large Original Blend Coffee — Cream, Sugar, 2 sweeteners',
          brand: "Dunkin'",
          brandEmoji: '🟠',
        },
      ],
    },
    {
      id: 'sample-round-3',
      at: now - 26 * 60 * min,
      buyerId: 'sample-eleanor',
      buyerName: 'Eleanor',
      buyerEmoji: '🫖',
      source: 'sample',
      occasion: 'hosting',
      note: 'Everyone came round after the match.',
      recipients: [
        {
          id: 'sample-priya',
          name: 'Priya',
          emoji: '🧋',
          drink: 'Medium Brown Sugar Milk Tea — Oat milk, sweetness: 50% — half sweet, ice: 25% — light ice, Tapioca pearls (boba)',
          brand: 'Boba & bubble tea',
          brandEmoji: '🧋',
        },
        {
          id: 'sample-marcus',
          name: 'Marcus',
          emoji: '🍺',
          drink: 'Beer — draft — style: Refreshing & long, Pilsner + IPA — Hazy / New England',
          brand: 'Bar & adult beverages',
          brandEmoji: '🍸',
        },
      ],
    },
  ];
}
