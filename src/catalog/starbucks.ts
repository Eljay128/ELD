import type { Brand } from './types.ts';
import { CAFFEINE, ICE, SWEETENER, SWEETENER_COUNT, milkGroup, vals } from './shared.ts';

/**
 * Starbucks. The deepest customization tree of any brand here, so it doubles as
 * the reference implementation: anything the editor can render, this brand uses.
 */
export const starbucks: Brand = {
  id: 'starbucks',
  name: 'Starbucks',
  short: 'Starbucks',
  emoji: '🟢',
  hue: 155,
  blurb: 'Five sizes, nine milks, and a syrup wall. Pumps are the unit of currency.',
  sources: [
    'https://www.starbucks.com/menu',
    'https://about.starbucks.com/uploads/2024/06/Beverage-Health-and-Wellness-Fact-Sheet-June-2024-3.pdf',
  ],
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'single',
      values: vals(
        { id: 'short', label: 'Short — 8 oz', note: 'Hot drinks only' },
        { id: 'tall', label: 'Tall — 12 oz' },
        { id: 'grande', label: 'Grande — 16 oz' },
        { id: 'venti', label: 'Venti — 20 oz hot / 24 oz iced' },
        { id: 'trenta', label: 'Trenta — 31 oz', note: 'Select cold drinks only' },
      ),
      fallback: 'grande',
    },
    {
      id: 'temp',
      label: 'Temperature',
      kind: 'single',
      values: vals('Hot', 'Iced', 'Blended', 'Extra hot', 'Kid temperature'),
      fallback: 'hot',
    },
    milkGroup(
      [
        'whole-milk',
        '2-milk',
        'nonfat-milk',
        'half-and-half',
        'heavy-cream',
        'oat-milk',
        'almond-milk',
        'soy-milk',
        'coconut-milk',
        'no-milk',
        'milk-on-side',
      ],
      '2-milk',
    ),
    {
      id: 'espresso_roast',
      label: 'Espresso roast',
      kind: 'single',
      values: vals(
        { id: 'signature', label: 'Signature Espresso Roast', note: 'The house default — dark, caramelly' },
        { id: 'blonde', label: 'Blonde Espresso', note: 'Lighter and sweeter' },
        { id: 'decaf-espresso', label: 'Decaf Espresso', tags: ['decaf'] },
      ),
      fallback: 'signature',
    },
    {
      id: 'shots',
      label: 'Espresso shots',
      kind: 'count',
      hint: 'Leave at 0 to take whatever the drink comes with.',
      min: 0,
      max: 8,
      fallback: 0,
    },
    {
      id: 'shot_style',
      label: 'Shot style',
      kind: 'multi',
      advanced: true,
      values: vals(
        { id: 'ristretto', label: 'Ristretto', note: 'Short pull, sweeter and more concentrated' },
        { id: 'long-shot', label: 'Long shot', note: 'Longer pull, more volume' },
        { id: 'affogato', label: 'Affogato-style', note: 'Shots poured over the top at the end' },
        { id: 'shot-on-side', label: 'Shots on the side' },
        { id: 'upside-down', label: 'Upside down', note: 'Build order reversed' },
      ),
    },
    CAFFEINE,
    {
      id: 'syrup',
      label: 'Syrups',
      kind: 'multi',
      hint: 'Pick as many as you actually want. Pump counts are set below.',
      values: vals(
        { id: 'vanilla', label: 'Vanilla', tags: ['sugar'] },
        { id: 'sf-vanilla', label: 'Sugar-free Vanilla', tags: ['sugar-free'] },
        { id: 'caramel', label: 'Caramel', tags: ['sugar'] },
        { id: 'hazelnut', label: 'Hazelnut', tags: ['sugar'] },
        { id: 'toffee-nut', label: 'Toffee Nut', tags: ['sugar'] },
        { id: 'brown-sugar', label: 'Brown Sugar', tags: ['sugar'] },
        { id: 'cinnamon-dolce', label: 'Cinnamon Dolce', tags: ['sugar'] },
        { id: 'peppermint', label: 'Peppermint', tags: ['sugar'] },
        { id: 'raspberry', label: 'Raspberry', tags: ['sugar'] },
        { id: 'classic', label: 'Classic syrup', note: 'Plain liquid sugar', tags: ['sugar'] },
        { id: 'honey-blend', label: 'Honey Blend', tags: ['sugar'] },
        { id: 'chai-concentrate', label: 'Chai concentrate', tags: ['sugar', 'caffeine'] },
        { id: 'pumpkin-spice', label: 'Pumpkin Spice sauce', tags: ['sugar'] },
        { id: 'peppermint-mocha', label: 'Peppermint Mocha', tags: ['sugar'] },
        { id: 'no-syrup', label: 'No syrup at all', tags: ['sugar-free'] },
      ),
    },
    {
      id: 'syrup_pumps',
      label: 'Syrup pumps',
      kind: 'count',
      hint: 'Standard is 3 in a Tall, 4 in a Grande, 5–6 in a Venti. 0 keeps the standard.',
      min: 0,
      max: 12,
      fallback: 0,
    },
    {
      id: 'sauce',
      label: 'Sauces',
      kind: 'multi',
      values: vals(
        { id: 'mocha', label: 'Mocha sauce', tags: ['sugar'] },
        { id: 'white-mocha', label: 'White Chocolate Mocha sauce', tags: ['sugar', 'dairy'] },
        { id: 'dark-caramel', label: 'Dark Caramel sauce', tags: ['sugar'] },
        { id: 'toasted-vanilla', label: 'Toasted Vanilla', tags: ['sugar'] },
      ),
    },
    {
      id: 'cold_foam',
      label: 'Cold foam',
      kind: 'single',
      values: vals(
        { id: 'none', label: 'None' },
        { id: 'sweet-cream', label: 'Sweet Cream Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'vanilla-sweet-cream', label: 'Vanilla Sweet Cream Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'salted-caramel-foam', label: 'Salted Caramel Cream Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'chocolate-foam', label: 'Chocolate Cream Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'matcha-foam', label: 'Matcha Cream Cold Foam', tags: ['dairy', 'sugar'] },
        { id: 'nondairy-foam', label: 'Non-dairy cold foam', note: 'Made with the alt milk you picked', tags: ['dairy-free'] },
      ),
      fallback: 'none',
    },
    {
      id: 'topping',
      label: 'Toppings & drizzle',
      kind: 'multi',
      values: vals(
        { id: 'whip', label: 'Whipped cream', tags: ['dairy'] },
        { id: 'no-whip', label: 'No whipped cream', tags: ['dairy-free'] },
        { id: 'extra-whip', label: 'Extra whipped cream', tags: ['dairy'] },
        { id: 'caramel-drizzle', label: 'Caramel drizzle', tags: ['sugar'] },
        { id: 'mocha-drizzle', label: 'Mocha drizzle', tags: ['sugar'] },
        { id: 'caramel-crunch', label: 'Caramel crunch topping', tags: ['sugar'] },
        { id: 'cinnamon-powder', label: 'Cinnamon powder' },
        { id: 'nutmeg', label: 'Nutmeg' },
        { id: 'cocoa-powder', label: 'Cocoa powder' },
        { id: 'vanilla-bean-powder', label: 'Vanilla bean powder' },
        { id: 'cookie-crumble', label: 'Cookie crumble', tags: ['gluten', 'sugar'] },
        { id: 'java-chips', label: 'Java chips', tags: ['sugar'] },
        { id: 'sea-salt', label: 'Sea salt topping' },
      ),
    },
    {
      id: 'inclusion',
      label: 'Inclusions & add-ins',
      kind: 'multi',
      advanced: true,
      values: vals(
        { id: 'strawberry-puree', label: 'Strawberry purée', tags: ['sugar'] },
        { id: 'lemonade', label: 'Splash of lemonade', tags: ['sugar'] },
        { id: 'freeze-dried-fruit', label: 'Freeze-dried fruit' },
        { id: 'protein-powder', label: 'Protein cold foam / powder' },
        { id: 'apple-juice', label: 'Splash of apple juice', tags: ['sugar'] },
        { id: 'water-splash', label: 'Splash of water' },
      ),
    },
    ICE,
    {
      id: 'blend',
      label: 'Blend',
      kind: 'single',
      advanced: true,
      hint: 'Frappuccinos and blended refreshers only.',
      values: vals('Standard blend', 'Light blend / thinner', 'Extra thick', 'Affogato-style pour on top'),
      fallback: 'standard-blend',
    },
    {
      id: 'tea_options',
      label: 'Tea options',
      kind: 'multi',
      advanced: true,
      hint: 'For brewed tea and tea lattes.',
      values: vals(
        { id: 'extra-bag', label: 'Extra tea bag' },
        { id: 'no-water', label: 'No water', note: 'All tea, no dilution' },
        { id: 'light-water', label: 'Light water' },
        { id: 'no-lemonade', label: 'No lemonade' },
        { id: 'steep-long', label: 'Steep it longer' },
      ),
    },
    SWEETENER,
    SWEETENER_COUNT,
    {
      id: 'room',
      label: 'Room at the top',
      kind: 'single',
      advanced: true,
      hint: 'For brewed coffee and Americanos you top up yourself.',
      values: vals('No room', 'A little room', 'Lots of room'),
      fallback: 'no-room',
    },
  ],
  drinks: [
    // ---- Espresso -------------------------------------------------------
    d('caffe-latte', 'Caffè Latte', 'Espresso', ['morning', 'day'], espresso()),
    d('cappuccino', 'Cappuccino', 'Espresso', ['morning'], espresso()),
    d('flat-white', 'Flat White', 'Espresso', ['morning'], espresso(), 'Ristretto shots and whole milk by default'),
    d('caffe-americano', 'Caffè Americano', 'Espresso', ['morning', 'day'], espresso()),
    d('espresso-shot', 'Espresso', 'Espresso', ['morning', 'day'], ['size', 'espresso_roast', 'shots', 'shot_style', 'caffeine', 'syrup', 'syrup_pumps']),
    d('espresso-macchiato', 'Espresso Macchiato', 'Espresso', ['morning'], espresso()),
    d('caffe-mocha', 'Caffè Mocha', 'Espresso', ['morning', 'day', 'evening'], espresso()),
    d('white-chocolate-mocha', 'White Chocolate Mocha', 'Espresso', ['day', 'evening'], espresso()),
    d('caramel-macchiato', 'Caramel Macchiato', 'Espresso', ['morning', 'day'], espresso()),
    d('cortado', 'Cortado', 'Espresso', ['morning'], espresso()),
    d('cinnamon-dolce-latte', 'Cinnamon Dolce Latte', 'Espresso', ['morning', 'day'], espresso()),
    d('brown-sugar-oatmilk-shaken', 'Brown Sugar Oatmilk Shaken Espresso', 'Espresso', ['morning', 'day'], espresso()),
    d('shaken-espresso', 'Iced Shaken Espresso', 'Espresso', ['morning', 'day'], espresso()),
    d('pumpkin-spice-latte', 'Pumpkin Spice Latte', 'Espresso', ['morning', 'day'], espresso(), undefined, true),
    d('peppermint-mocha-drink', 'Peppermint Mocha', 'Espresso', ['day', 'evening'], espresso(), undefined, true),

    // ---- Brewed ---------------------------------------------------------
    d('pike-place', 'Pike Place Roast', 'Brewed coffee', ['morning', 'day'], brewed()),
    d('blonde-roast', 'Blonde Roast', 'Brewed coffee', ['morning'], brewed()),
    d('dark-roast', 'Dark Roast', 'Brewed coffee', ['morning', 'day'], brewed()),
    d('decaf-pike', 'Decaf Pike Place', 'Brewed coffee', ['evening'], brewed(), undefined, false, ['decaf']),
    d('cold-brew', 'Cold Brew', 'Cold coffee', ['morning', 'day'], cold()),
    d('nitro-cold-brew', 'Nitro Cold Brew', 'Cold coffee', ['morning', 'day'], cold().filter((g) => g !== 'ice')),
    d('vanilla-sweet-cream-cold-brew', 'Vanilla Sweet Cream Cold Brew', 'Cold coffee', ['morning', 'day'], cold()),
    d('iced-coffee', 'Iced Coffee', 'Cold coffee', ['morning', 'day'], cold()),

    // ---- Frappuccino ----------------------------------------------------
    d('caramel-frappuccino', 'Caramel Frappuccino', 'Frappuccino', ['day', 'evening'], frap()),
    d('mocha-frappuccino', 'Mocha Frappuccino', 'Frappuccino', ['day', 'evening'], frap()),
    d('java-chip-frappuccino', 'Java Chip Frappuccino', 'Frappuccino', ['day', 'evening'], frap()),
    d('vanilla-bean-frappuccino', 'Vanilla Bean Crème Frappuccino', 'Frappuccino', ['day', 'evening'], frap(), 'No coffee', false, ['decaf']),
    d('strawberry-creme-frappuccino', 'Strawberry Crème Frappuccino', 'Frappuccino', ['day'], frap(), 'No coffee', false, ['decaf']),
    d('espresso-frappuccino', 'Espresso Frappuccino', 'Frappuccino', ['day'], frap()),

    // ---- Tea ------------------------------------------------------------
    d('chai-tea-latte', 'Chai Tea Latte', 'Tea', ['morning', 'day'], tea()),
    d('matcha-tea-latte', 'Matcha Tea Latte', 'Tea', ['morning', 'day'], tea()),
    d('london-fog', 'London Fog Tea Latte', 'Tea', ['morning', 'evening'], tea()),
    d('royal-english-breakfast', 'Royal English Breakfast Tea', 'Tea', ['morning'], tea()),
    d('emperors-clouds-mist', "Emperor's Clouds & Mist", 'Tea', ['morning', 'day'], tea()),
    d('jade-citrus-mint', 'Jade Citrus Mint Green Tea', 'Tea', ['day'], tea()),
    d('mint-majesty', 'Mint Majesty Herbal Tea', 'Tea', ['evening'], tea(), undefined, false, ['decaf']),
    d('peach-tranquility', 'Peach Tranquility Herbal Tea', 'Tea', ['evening'], tea(), undefined, false, ['decaf']),
    d('medicine-ball', 'Honey Citrus Mint Tea', 'Tea', ['evening'], tea(), 'The "Medicine Ball"'),
    d('iced-black-tea', 'Iced Black Tea', 'Tea', ['day'], tea()),
    d('iced-green-tea', 'Iced Green Tea', 'Tea', ['day'], tea()),
    d('iced-passion-tango', 'Iced Passion Tango Tea', 'Tea', ['day', 'evening'], tea(), undefined, false, ['decaf']),

    // ---- Refreshers & other --------------------------------------------
    d('strawberry-acai-refresher', 'Strawberry Açaí Refresher', 'Refreshers', ['day'], refresher()),
    d('mango-dragonfruit-refresher', 'Mango Dragonfruit Refresher', 'Refreshers', ['day'], refresher()),
    d('summer-berry-refresher', 'Summer-Berry Refresher', 'Refreshers', ['day'], refresher(), undefined, true),
    d('pink-drink', 'Pink Drink', 'Refreshers', ['day'], refresher()),
    d('dragon-drink', 'Dragon Drink', 'Refreshers', ['day'], refresher()),
    d('hot-chocolate', 'Hot Chocolate', 'Other', ['evening'], other(), undefined, false, ['decaf']),
    d('white-hot-chocolate', 'White Hot Chocolate', 'Other', ['evening'], other(), undefined, false, ['decaf']),
    d('steamed-milk', 'Steamed Milk / Steamer', 'Other', ['evening'], other(), undefined, false, ['decaf']),
    d('caramel-apple-spice', 'Caramel Apple Spice', 'Other', ['evening'], other(), undefined, true, ['decaf']),
    d('sparkling-water', 'Sparkling Water', 'Other', ['day'], ['size', 'ice'], undefined, false, ['decaf']),
  ],
};

// --- group presets, kept next to the drinks that use them ------------------

function espresso(): string[] {
  return [
    'size', 'temp', 'milk', 'espresso_roast', 'shots', 'shot_style', 'caffeine',
    'syrup', 'syrup_pumps', 'sauce', 'cold_foam', 'topping', 'inclusion', 'ice',
    'sweetener', 'sweetener_count',
  ];
}
function brewed(): string[] {
  return ['size', 'temp', 'milk', 'caffeine', 'syrup', 'syrup_pumps', 'topping', 'sweetener', 'sweetener_count', 'room'];
}
function cold(): string[] {
  return ['size', 'milk', 'caffeine', 'syrup', 'syrup_pumps', 'sauce', 'cold_foam', 'topping', 'inclusion', 'ice', 'sweetener', 'sweetener_count'];
}
function frap(): string[] {
  return ['size', 'milk', 'espresso_roast', 'shots', 'caffeine', 'syrup', 'syrup_pumps', 'sauce', 'topping', 'inclusion', 'blend', 'sweetener'];
}
function tea(): string[] {
  return ['size', 'temp', 'milk', 'syrup', 'syrup_pumps', 'cold_foam', 'topping', 'tea_options', 'ice', 'sweetener', 'sweetener_count'];
}
function refresher(): string[] {
  return ['size', 'temp', 'milk', 'syrup', 'syrup_pumps', 'inclusion', 'cold_foam', 'ice', 'sweetener'];
}
function other(): string[] {
  return ['size', 'temp', 'milk', 'syrup', 'syrup_pumps', 'sauce', 'topping', 'sweetener', 'sweetener_count'];
}

function d(
  id: string,
  name: string,
  family: string,
  dayparts: Brand['drinks'][number]['dayparts'],
  groups: string[],
  note?: string,
  seasonal?: boolean,
  tags?: Brand['drinks'][number]['tags'],
): Brand['drinks'][number] {
  return { id, name, family, dayparts, groups, note, seasonal, tags };
}
