import type { Brand, Drink } from './types.ts';
import { CAFFEINE, ICE, SWEETENER, SWEETENER_COUNT, milkGroup, vals } from './shared.ts';

/**
 * Dunkin'. The distinction that trips people up: **swirls** are sweetened and
 * dairy-based, **shots** are unsweetened flavour only. Both are modelled here so
 * a profile can say precisely which one it means.
 */
export const dunkin: Brand = {
  id: 'dunkin',
  name: "Dunkin'",
  short: "Dunkin'",
  emoji: '🟠',
  hue: 55,
  blurb: 'Swirls are sweet, shots are not. Say which one you mean and you get the right cup.',
  sources: ['https://www.dunkindonuts.com/en/menu', 'https://godairyfree.org/dining-out/dunkin-donuts'],
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals(
        { id: 'small', label: 'Small — 10 oz' },
        { id: 'medium', label: 'Medium — 14 oz' },
        { id: 'large', label: 'Large — 20 oz' },
        { id: 'xl', label: 'Extra Large — 24 oz', note: 'Hot coffee only' },
      ),
      fallback: 'medium',
    },
    {
      id: 'temp',
      label: 'Temperature',
      kind: 'single',
      values: vals('Hot', 'Iced', 'Frozen'),
      fallback: 'hot',
    },
    milkGroup(['whole-milk', '2-milk', 'nonfat-milk', 'cream', 'half-and-half', 'oat-milk', 'almond-milk', 'coconut-milk', 'no-milk', 'milk-on-side'], 'cream'),
    {
      id: 'dairy_amount',
      label: 'How much dairy',
      kind: 'scale',
      values: vals('None — black', 'Just a splash', 'Light', 'Regular', 'Extra / extra-extra'),
      fallback: 'regular',
    },
    CAFFEINE,
    {
      id: 'shots',
      label: 'Espresso shots',
      kind: 'count',
      hint: 'Extra shots on top of what the drink includes.',
      min: 0,
      max: 6,
      fallback: 0,
    },
    {
      id: 'swirl',
      label: 'Flavor swirls',
      kind: 'multi',
      hint: 'Sweetened and creamy — these add sugar and dairy.',
      values: vals(
        { id: 'french-vanilla-swirl', label: 'French Vanilla swirl', tags: ['sugar', 'dairy'] },
        { id: 'caramel-swirl', label: 'Caramel swirl', tags: ['sugar', 'dairy'] },
        { id: 'mocha-swirl', label: 'Mocha swirl', tags: ['sugar', 'dairy'] },
        { id: 'hazelnut-swirl', label: 'Hazelnut swirl', tags: ['sugar', 'dairy'] },
        { id: 'cookie-butter-swirl', label: 'Cookie Butter swirl', tags: ['sugar', 'dairy'] },
        { id: 'pumpkin-swirl', label: 'Pumpkin swirl', tags: ['sugar', 'dairy'] },
        { id: 'peppermint-mocha-swirl', label: 'Peppermint Mocha swirl', tags: ['sugar', 'dairy'] },
      ),
    },
    {
      id: 'shot_flavor',
      label: 'Flavor shots',
      kind: 'multi',
      hint: 'Unsweetened, dairy-free flavour. The sugar-free route.',
      values: vals(
        { id: 'vanilla-shot', label: 'Vanilla shot', tags: ['sugar-free', 'dairy-free'] },
        { id: 'hazelnut-shot', label: 'Hazelnut shot', tags: ['sugar-free', 'dairy-free', 'nut'] },
        { id: 'toasted-almond-shot', label: 'Toasted Almond shot', tags: ['sugar-free', 'dairy-free', 'nut'] },
        { id: 'blueberry-shot', label: 'Blueberry shot', tags: ['sugar-free', 'dairy-free'] },
        { id: 'raspberry-shot', label: 'Raspberry shot', tags: ['sugar-free', 'dairy-free'] },
        { id: 'coconut-shot', label: 'Coconut shot', tags: ['sugar-free', 'dairy-free'] },
      ),
    },
    {
      id: 'pumps',
      label: 'Pumps of swirl / shot',
      kind: 'count',
      hint: '0 keeps the standard count for the size.',
      min: 0,
      max: 10,
      fallback: 0,
    },
    SWEETENER,
    SWEETENER_COUNT,
    {
      id: 'topping',
      label: 'Toppings',
      kind: 'multi',
      values: vals(
        { id: 'whipped-cream', label: 'Whipped cream', tags: ['dairy'] },
        { id: 'no-whip', label: 'No whipped cream', tags: ['dairy-free'] },
        { id: 'cold-foam', label: 'Sweet Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'pumpkin-cold-foam', label: 'Pumpkin Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'cinnamon-sugar', label: 'Cinnamon sugar topping', tags: ['sugar'] },
        { id: 'caramel-drizzle', label: 'Caramel drizzle', tags: ['sugar'] },
        { id: 'mocha-drizzle', label: 'Mocha drizzle', tags: ['sugar'] },
      ),
    },
    ICE,
    {
      id: 'turbo',
      label: 'Turbo shot',
      kind: 'single',
      advanced: true,
      hint: 'An extra hit of espresso stirred into brewed coffee.',
      values: vals('No', 'Yes — one turbo shot', 'Yes — double turbo'),
      fallback: 'no',
    },
  ],
  drinks: [
    dd('original-blend-hot', 'Original Blend Coffee', 'Coffee', ['morning', 'day'], base(['turbo'])),
    dd('dunkin-midnight', 'Dunkin’ Midnight', 'Coffee', ['morning', 'day'], base(['turbo']), 'The dark roast'),
    dd('iced-coffee', 'Iced Coffee', 'Coffee', ['morning', 'day'], base(['turbo'])),
    dd('cold-brew', 'Cold Brew', 'Coffee', ['morning', 'day'], base()),
    dd('nitro-cold-brew', 'Nitro Cold Brew', 'Coffee', ['morning', 'day'], base()),
    dd('latte', 'Latte', 'Espresso', ['morning', 'day'], base()),
    dd('cappuccino', 'Cappuccino', 'Espresso', ['morning'], base()),
    dd('americano', 'Americano', 'Espresso', ['morning', 'day'], base()),
    dd('macchiato', 'Macchiato', 'Espresso', ['morning', 'day'], base()),
    dd('signature-latte', 'Signature Latte', 'Espresso', ['day', 'evening'], base(), 'Comes topped with whipped cream and drizzle'),
    dd('espresso', 'Espresso', 'Espresso', ['morning', 'day'], ['size', 'caffeine', 'shots', 'shot_flavor', 'sweetener']),
    dd('dunkin-refresher', 'Dunkin’ Refresher', 'Refreshers', ['day'], base(), 'Green tea or lemonade base'),
    dd('coolatta', 'Frozen Coolatta', 'Frozen', ['day'], base()),
    dd('frozen-coffee', 'Frozen Coffee', 'Frozen', ['day'], base()),
    dd('frozen-chocolate', 'Frozen Chocolate', 'Frozen', ['day', 'evening'], base(), undefined, ['decaf']),
    dd('hot-chocolate', 'Hot Chocolate', 'Other', ['evening'], base(), undefined, ['decaf']),
    dd('chai-latte', 'Chai Latte', 'Tea', ['morning', 'day'], base()),
    dd('matcha-latte', 'Matcha Latte', 'Tea', ['morning', 'day'], base()),
    dd('hot-tea', 'Hot Tea', 'Tea', ['morning', 'evening'], base()),
    dd('iced-tea', 'Iced Tea', 'Tea', ['day'], base()),
    dd('lemonade', 'Lemonade', 'Other', ['day'], ['size', 'ice', 'sweetener', 'shot_flavor'], undefined, ['decaf']),
  ],
};

function base(extra: string[] = []): string[] {
  return [
    'size', 'temp', 'milk', 'dairy_amount', 'caffeine', 'shots', 'swirl', 'shot_flavor',
    'pumps', 'sweetener', 'sweetener_count', 'topping', 'ice', ...extra,
  ];
}

function dd(
  id: string,
  name: string,
  family: string,
  dayparts: Drink['dayparts'],
  groups: string[],
  note?: string,
  tags?: Drink['tags'],
): Drink {
  return { id, name, family, dayparts, groups, note, tags };
}
