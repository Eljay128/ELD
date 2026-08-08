import type { Brand, Drink } from './types.ts';
import { CAFFEINE, ICE, SWEETENER, SWEETENER_COUNT, milkGroup, vals } from './shared.ts';

/**
 * The rest of the coffee-shop field. These share a common backbone — size,
 * temperature, milk, sweetener — with the house specialities that actually
 * distinguish them layered on top.
 */

function drink(
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

const COMMON_MILKS = ['whole-milk', '2-milk', 'nonfat-milk', 'half-and-half', 'cream', 'oat-milk', 'almond-milk', 'soy-milk', 'coconut-milk', 'no-milk', 'milk-on-side'];

// ---------------------------------------------------------------------------
// Dutch Bros
// ---------------------------------------------------------------------------

export const dutchBros: Brand = {
  id: 'dutch-bros',
  name: 'Dutch Bros Coffee',
  short: 'Dutch Bros',
  emoji: '🔵',
  hue: 250,
  blurb: 'Pick a base, pick syrups, pick a top. Rebel energy counts as a base here.',
  sources: ['https://www.dutchbros.com/menu'],
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals(
        { id: 'kids', label: 'Kids — 8 oz' },
        { id: 'small', label: 'Small — 12 oz' },
        { id: 'medium', label: 'Medium — 16 oz' },
        { id: 'large', label: 'Large — 20 oz' },
      ),
      fallback: 'medium',
    },
    { id: 'temp', label: 'Temperature', kind: 'single', values: vals('Hot', 'Iced', 'Blended'), fallback: 'iced' },
    {
      id: 'drink_base',
      label: 'Base',
      kind: 'single',
      hint: 'The thing everything else gets built on.',
      values: vals(
        { id: 'coffee-base', label: 'Coffee / espresso', tags: ['caffeine'] },
        { id: 'rebel', label: 'Rebel energy drink', tags: ['caffeine', 'sugar'] },
        { id: 'sugar-free-rebel', label: 'Sugar-free Rebel', tags: ['caffeine', 'sugar-free'] },
        { id: 'tea-base', label: 'Tea', tags: ['caffeine'] },
        { id: 'lemonade-base', label: 'Lemonade', tags: ['sugar'] },
        { id: 'chocolate-milk-base', label: 'Chocolate milk', tags: ['dairy', 'sugar'] },
        { id: 'soda-base', label: 'Green Apple / Italian soda', tags: ['sugar'] },
        { id: 'smoothie-base', label: 'Smoothie', tags: ['sugar'] },
      ),
      fallback: 'coffee-base',
    },
    milkGroup(COMMON_MILKS, 'whole-milk'),
    CAFFEINE,
    { id: 'shots', label: 'Extra espresso shots', kind: 'count', min: 0, max: 6, fallback: 0 },
    {
      id: 'syrup',
      label: 'Syrups',
      kind: 'multi',
      values: vals(
        { id: 'vanilla', label: 'Vanilla', tags: ['sugar'] },
        { id: 'caramel', label: 'Caramel', tags: ['sugar'] },
        { id: 'chocolate-macadamia-nut', label: 'Chocolate Macadamia Nut', tags: ['sugar', 'nut'] },
        { id: 'white-chocolate', label: 'White chocolate', tags: ['sugar'] },
        { id: 'hazelnut', label: 'Hazelnut', tags: ['sugar', 'nut'] },
        { id: 'irish-cream', label: 'Irish Cream', tags: ['sugar'] },
        { id: 'salted-caramel', label: 'Salted Caramel', tags: ['sugar'] },
        { id: 'coconut', label: 'Coconut', tags: ['sugar'] },
        { id: 'peppermint', label: 'Peppermint', tags: ['sugar'] },
        { id: 'raspberry', label: 'Raspberry', tags: ['sugar'] },
        { id: 'strawberry', label: 'Strawberry', tags: ['sugar'] },
        { id: 'blue-raspberry', label: 'Blue Raspberry', tags: ['sugar'] },
        { id: 'passionfruit', label: 'Passionfruit', tags: ['sugar'] },
        { id: 'peach', label: 'Peach', tags: ['sugar'] },
        { id: 'sf-vanilla', label: 'Sugar-free Vanilla', tags: ['sugar-free'] },
        { id: 'sf-caramel', label: 'Sugar-free Caramel', tags: ['sugar-free'] },
        { id: 'sf-chocolate-mac', label: 'Sugar-free Chocolate Macadamia', tags: ['sugar-free', 'nut'] },
      ),
    },
    { id: 'syrup_pumps', label: 'Pumps', kind: 'count', hint: '0 keeps the standard.', min: 0, max: 10, fallback: 0 },
    {
      id: 'top',
      label: 'Top it with',
      kind: 'multi',
      values: vals(
        { id: 'soft-top', label: 'Soft Top', note: 'The house sweet cold foam', tags: ['dairy', 'sugar'] },
        { id: 'whipped-cream', label: 'Whipped cream', tags: ['dairy'] },
        { id: 'no-whip', label: 'No whipped cream', tags: ['dairy-free'] },
        { id: 'drizzle', label: 'Drizzle', tags: ['sugar'] },
        { id: 'sprinkles', label: 'Sprinkles / topping', tags: ['sugar'] },
      ),
    },
    ICE,
    SWEETENER,
  ],
  drinks: [
    drink('golden-eagle', 'Golden Eagle', 'Signature', ['morning', 'day'], dbAll()),
    drink('annihilator', 'Annihilator', 'Signature', ['morning', 'day'], dbAll()),
    drink('caramelizer', 'Caramelizer', 'Signature', ['morning', 'day'], dbAll()),
    drink('kicker', 'Kicker', 'Signature', ['morning'], dbAll()),
    drink('double-torture', 'Double Torture', 'Signature', ['morning'], dbAll()),
    drink('cocomo', 'Cocomo', 'Signature', ['day', 'evening'], dbAll()),
    drink('latte', 'Latte', 'Espresso', ['morning', 'day'], dbAll()),
    drink('americano', 'Americano', 'Espresso', ['morning', 'day'], dbAll()),
    drink('breve', 'Breve', 'Espresso', ['morning'], dbAll()),
    drink('cold-brew', 'Cold Brew', 'Coffee', ['morning', 'day'], dbAll()),
    drink('rebel-energy', 'Rebel Energy Drink', 'Rebel', ['day'], dbAll()),
    drink('rebel-freeze', 'Rebel Freeze', 'Rebel', ['day'], dbAll()),
    drink('green-tea', 'Green Tea', 'Tea', ['day'], dbAll()),
    drink('chai-latte', 'Chai Latte', 'Tea', ['morning', 'day'], dbAll()),
    drink('lemonade', 'Lemonade', 'Cold', ['day'], dbAll(), undefined, ['decaf']),
    drink('smoothie', 'Smoothie', 'Cold', ['day'], dbAll(), undefined, ['decaf']),
    drink('frost', 'Frost', 'Frozen', ['day', 'evening'], dbAll()),
    drink('hot-chocolate', 'Hot Chocolate', 'Other', ['evening'], dbAll(), undefined, ['decaf']),
  ],
};

function dbAll(): string[] {
  return ['size', 'temp', 'drink_base', 'milk', 'caffeine', 'shots', 'syrup', 'syrup_pumps', 'top', 'ice', 'sweetener'];
}

// ---------------------------------------------------------------------------
// Tim Hortons
// ---------------------------------------------------------------------------

export const timHortons: Brand = {
  id: 'tim-hortons',
  name: 'Tim Hortons',
  short: 'Tims',
  emoji: '🍁',
  hue: 25,
  blurb: 'Where "double-double" is a complete sentence. Cream and sugar counts are the whole language.',
  sources: ['https://www.timhortons.com/menu'],
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals(
        { id: 'extra-small', label: 'Extra Small — 10 oz' },
        { id: 'small', label: 'Small — 12 oz' },
        { id: 'medium', label: 'Medium — 14 oz' },
        { id: 'large', label: 'Large — 20 oz' },
        { id: 'extra-large', label: 'Extra Large — 24 oz' },
      ),
      fallback: 'medium',
    },
    { id: 'temp', label: 'Temperature', kind: 'single', values: vals('Hot', 'Iced', 'Frozen'), fallback: 'hot' },
    milkGroup(['whole-milk', '2-milk', 'nonfat-milk', 'cream', 'half-and-half', 'oat-milk', 'almond-milk', 'no-milk'], 'cream'),
    {
      id: 'cream_count',
      label: 'Creams',
      kind: 'count',
      hint: 'Two creams and two sugars is a double-double.',
      min: 0,
      max: 6,
      fallback: 1,
    },
    { id: 'sugar_count', label: 'Sugars', kind: 'count', min: 0, max: 6, fallback: 1 },
    CAFFEINE,
    { id: 'shots', label: 'Extra espresso shots', kind: 'count', min: 0, max: 4, fallback: 0 },
    {
      id: 'flavour',
      label: 'Flavour shots',
      kind: 'multi',
      values: vals(
        { id: 'french-vanilla', label: 'French Vanilla', tags: ['sugar'] },
        { id: 'caramel', label: 'Caramel', tags: ['sugar'] },
        { id: 'hazelnut', label: 'Hazelnut', tags: ['sugar', 'nut'] },
        { id: 'mocha', label: 'Mocha', tags: ['sugar'] },
        { id: 'vanilla', label: 'Vanilla', tags: ['sugar'] },
      ),
    },
    SWEETENER,
    SWEETENER_COUNT,
    {
      id: 'topping',
      label: 'Toppings',
      kind: 'multi',
      values: vals(
        { id: 'whipped-topping', label: 'Whipped topping', tags: ['dairy'] },
        { id: 'no-whip', label: 'No whipped topping', tags: ['dairy-free'] },
        { id: 'caramel-drizzle', label: 'Caramel drizzle', tags: ['sugar'] },
        { id: 'chocolate-drizzle', label: 'Chocolate drizzle', tags: ['sugar'] },
      ),
    },
    ICE,
  ],
  drinks: [
    drink('original-blend', 'Original Blend Coffee', 'Coffee', ['morning', 'day'], timAll()),
    drink('dark-roast', 'Dark Roast Coffee', 'Coffee', ['morning', 'day'], timAll()),
    drink('iced-capp', 'Iced Capp', 'Frozen', ['day'], timAll()),
    drink('french-vanilla-cappuccino', 'French Vanilla Cappuccino', 'Espresso', ['morning', 'day'], timAll()),
    drink('latte', 'Latte', 'Espresso', ['morning', 'day'], timAll()),
    drink('cold-brew', 'Cold Brew', 'Coffee', ['morning', 'day'], timAll()),
    drink('steeped-tea', 'Steeped Tea', 'Tea', ['morning', 'evening'], timAll()),
    drink('london-fog', 'London Fog', 'Tea', ['evening'], timAll()),
    drink('hot-chocolate', 'Hot Chocolate', 'Other', ['evening'], timAll(), undefined, ['decaf']),
    drink('quencher', 'Quencher', 'Cold', ['day'], timAll(), undefined, ['decaf']),
  ],
};

function timAll(): string[] {
  return ['size', 'temp', 'milk', 'cream_count', 'sugar_count', 'caffeine', 'shots', 'flavour', 'sweetener', 'sweetener_count', 'topping', 'ice'];
}

// ---------------------------------------------------------------------------
// A generic independent café — covers everything not on this list
// ---------------------------------------------------------------------------

export const localCafe: Brand = {
  id: 'local-cafe',
  name: 'Local café / third wave',
  short: 'Local café',
  emoji: '☕',
  hue: 30,
  blurb: 'For the shop on your corner. Sizes in ounces, and room to name the roaster.',
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals('Small — 8 oz', 'Medium — 12 oz', 'Large — 16 oz', 'Extra large — 20 oz'),
      fallback: 'medium-12-oz',
    },
    { id: 'temp', label: 'Temperature', kind: 'single', values: vals('Hot', 'Iced', 'Blended', 'Room temperature'), fallback: 'hot' },
    milkGroup([...COMMON_MILKS, 'heavy-cream', 'lactose-free'], 'whole-milk'),
    CAFFEINE,
    { id: 'shots', label: 'Espresso shots', kind: 'count', min: 0, max: 6, fallback: 0 },
    {
      id: 'brew_method',
      label: 'Brew method',
      kind: 'single',
      advanced: true,
      values: vals('Whatever they pour', 'Espresso', 'Pour over / V60', 'Chemex', 'French press', 'Aeropress', 'Batch brew', 'Siphon', 'Moka pot', 'Cold brew', 'Turkish', 'Percolator'),
      fallback: 'whatever-they-pour',
    },
    {
      id: 'roast',
      label: 'Roast preference',
      kind: 'single',
      advanced: true,
      values: vals('No preference', 'Light', 'Medium', 'Dark', 'Single origin if they have one', 'Whatever the barista likes'),
      fallback: 'no-preference',
    },
    {
      id: 'syrup',
      label: 'Syrups',
      kind: 'multi',
      values: vals(
        { id: 'vanilla', label: 'Vanilla', tags: ['sugar'] },
        { id: 'caramel', label: 'Caramel', tags: ['sugar'] },
        { id: 'mocha', label: 'Mocha / chocolate', tags: ['sugar'] },
        { id: 'hazelnut', label: 'Hazelnut', tags: ['sugar', 'nut'] },
        { id: 'lavender', label: 'Lavender', tags: ['sugar'] },
        { id: 'honey-lavender', label: 'Honey lavender', tags: ['sugar'] },
        { id: 'cardamom', label: 'Cardamom', tags: ['sugar'] },
        { id: 'maple', label: 'Maple', tags: ['sugar'] },
        { id: 'brown-sugar-cinnamon', label: 'Brown sugar cinnamon', tags: ['sugar'] },
        { id: 'rose', label: 'Rose', tags: ['sugar'] },
        { id: 'none', label: 'No syrup', tags: ['sugar-free'] },
      ),
    },
    { id: 'syrup_pumps', label: 'Pumps', kind: 'count', min: 0, max: 8, fallback: 0 },
    SWEETENER,
    SWEETENER_COUNT,
    ICE,
    {
      id: 'topping',
      label: 'Toppings',
      kind: 'multi',
      values: vals(
        { id: 'whipped-cream', label: 'Whipped cream', tags: ['dairy'] },
        { id: 'cinnamon', label: 'Cinnamon' },
        { id: 'cocoa', label: 'Cocoa powder' },
        { id: 'sea-salt', label: 'Sea salt' },
        { id: 'latte-art', label: 'Latte art appreciated' },
      ),
    },
  ],
  drinks: [
    drink('espresso', 'Espresso', 'Espresso', ['morning', 'day'], cafeAll()),
    drink('macchiato', 'Macchiato', 'Espresso', ['morning'], cafeAll()),
    drink('cortado', 'Cortado', 'Espresso', ['morning'], cafeAll()),
    drink('gibraltar', 'Gibraltar', 'Espresso', ['morning'], cafeAll()),
    drink('flat-white', 'Flat White', 'Espresso', ['morning'], cafeAll()),
    drink('cappuccino', 'Cappuccino', 'Espresso', ['morning'], cafeAll()),
    drink('latte', 'Latte', 'Espresso', ['morning', 'day'], cafeAll()),
    drink('mocha', 'Mocha', 'Espresso', ['day', 'evening'], cafeAll()),
    drink('americano', 'Americano', 'Espresso', ['morning', 'day'], cafeAll()),
    drink('drip-coffee', 'Drip coffee', 'Coffee', ['morning', 'day'], cafeAll()),
    drink('pour-over', 'Pour over', 'Coffee', ['morning'], cafeAll()),
    drink('cold-brew', 'Cold brew', 'Coffee', ['morning', 'day'], cafeAll()),
    drink('nitro', 'Nitro', 'Coffee', ['morning', 'day'], cafeAll()),
    drink('matcha-latte', 'Matcha latte', 'Tea', ['morning', 'day'], cafeAll()),
    drink('chai-latte', 'Chai latte', 'Tea', ['morning', 'day'], cafeAll()),
    drink('hojicha-latte', 'Hojicha latte', 'Tea', ['day', 'evening'], cafeAll()),
    drink('london-fog', 'London fog', 'Tea', ['evening'], cafeAll()),
    drink('herbal-tea', 'Herbal tea', 'Tea', ['evening'], cafeAll(), undefined, ['decaf']),
    drink('hot-chocolate', 'Hot chocolate', 'Other', ['evening'], cafeAll(), undefined, ['decaf']),
    drink('golden-milk', 'Turmeric golden milk', 'Other', ['evening'], cafeAll(), undefined, ['decaf']),
  ],
};

function cafeAll(): string[] {
  return ['size', 'temp', 'milk', 'caffeine', 'shots', 'brew_method', 'roast', 'syrup', 'syrup_pumps', 'sweetener', 'sweetener_count', 'ice', 'topping'];
}

// ---------------------------------------------------------------------------
// Fast food & convenience — McCafé, Chick-fil-A, Sonic, 7-Eleven, Panera
// ---------------------------------------------------------------------------

export const fastFood: Brand = {
  id: 'fast-food',
  name: 'Fast food & convenience',
  short: 'Fast food',
  emoji: '🍔',
  hue: 15,
  blurb: 'McCafé, Chick-fil-A, Sonic, 7-Eleven, Panera and the rest of the drive-thru field.',
  groups: [
    {
      id: 'chain',
      label: 'Which chain',
      kind: 'single',
      values: vals(
        "McDonald's / McCafé",
        'Chick-fil-A',
        'Sonic Drive-In',
        'Taco Bell',
        'Wendy’s',
        'Burger King',
        'Panera Bread',
        'Chipotle',
        '7-Eleven',
        'Wawa',
        'Sheetz',
        'QuikTrip',
        'Circle K',
        'Costco food court',
      ),
      fallback: 'mcdonald-s-mccafe',
    },
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals('Kids', 'Small', 'Medium', 'Large', 'Extra large / Route 44'),
      fallback: 'medium',
    },
    { id: 'temp', label: 'Temperature', kind: 'single', values: vals('Hot', 'Iced', 'Frozen'), fallback: 'iced' },
    milkGroup(['whole-milk', '2-milk', 'nonfat-milk', 'cream', 'half-and-half', 'oat-milk', 'almond-milk', 'no-milk'], 'cream'),
    CAFFEINE,
    {
      id: 'soda_flavor',
      label: 'Fountain add-ins',
      kind: 'multi',
      hint: 'Sonic and convenience-store fountains will mix these in.',
      values: vals(
        { id: 'cherry', label: 'Cherry', tags: ['sugar'] },
        { id: 'vanilla', label: 'Vanilla', tags: ['sugar'] },
        { id: 'lime', label: 'Lime', tags: ['sugar'] },
        { id: 'strawberry', label: 'Strawberry', tags: ['sugar'] },
        { id: 'peach', label: 'Peach', tags: ['sugar'] },
        { id: 'blue-raspberry', label: 'Blue raspberry', tags: ['sugar'] },
        { id: 'coconut', label: 'Coconut', tags: ['sugar'] },
        { id: 'orange', label: 'Orange', tags: ['sugar'] },
        { id: 'grape', label: 'Grape', tags: ['sugar'] },
        { id: 'nerds', label: 'Nerds / candy add-in', tags: ['sugar'] },
      ),
    },
    {
      id: 'ice_type',
      label: 'Ice type',
      kind: 'single',
      hint: 'The pellet-ice question is not a joke to some people.',
      values: vals('No preference', 'Pellet / nugget ice', 'Cubed ice', 'Crushed ice', 'No ice'),
      fallback: 'no-preference',
    },
    ICE,
    SWEETENER,
    SWEETENER_COUNT,
    {
      id: 'topping',
      label: 'Toppings',
      kind: 'multi',
      values: vals(
        { id: 'whipped-cream', label: 'Whipped cream', tags: ['dairy'] },
        { id: 'no-whip', label: 'No whipped cream', tags: ['dairy-free'] },
        { id: 'caramel-drizzle', label: 'Caramel drizzle', tags: ['sugar'] },
        { id: 'chocolate-drizzle', label: 'Chocolate drizzle', tags: ['sugar'] },
        { id: 'cherry-on-top', label: 'Cherry on top' },
      ),
    },
  ],
  drinks: [
    drink('drip-coffee', 'Drip coffee', 'Coffee', ['morning', 'day'], ffAll()),
    drink('iced-coffee', 'Iced coffee', 'Coffee', ['morning', 'day'], ffAll()),
    drink('latte', 'Latte', 'Espresso', ['morning', 'day'], ffAll()),
    drink('mocha', 'Mocha', 'Espresso', ['day', 'evening'], ffAll()),
    drink('frappe', 'Frappé', 'Frozen', ['day'], ffAll()),
    drink('sweet-tea', 'Sweet tea', 'Tea', ['day'], ffAll()),
    drink('unsweet-tea', 'Unsweetened iced tea', 'Tea', ['day'], ffAll()),
    drink('half-and-half-tea', 'Half sweet tea / half lemonade', 'Tea', ['day'], ffAll(), 'The Arnold Palmer'),
    drink('lemonade', 'Lemonade', 'Cold', ['day'], ffAll(), undefined, ['decaf']),
    drink('fountain-soda', 'Fountain soda', 'Soda', ['day'], ffAll()),
    drink('diet-soda', 'Diet fountain soda', 'Soda', ['day'], ffAll(), undefined, ['sugar-free']),
    drink('slush', 'Slush / ICEE', 'Frozen', ['day'], ffAll(), undefined, ['decaf']),
    drink('milkshake', 'Milkshake', 'Frozen', ['day', 'evening'], ffAll(), undefined, ['dairy', 'decaf']),
    drink('energy-drink', 'Energy drink', 'Energy', ['day'], ffAll()),
    drink('bottled-water', 'Bottled water', 'Other', ['morning', 'day', 'evening'], ['chain', 'size', 'ice_type'], undefined, ['decaf']),
  ],
};

function ffAll(): string[] {
  return ['chain', 'size', 'temp', 'milk', 'caffeine', 'soda_flavor', 'ice_type', 'ice', 'sweetener', 'sweetener_count', 'topping'];
}
