import type { OptionGroup, OptionValue } from './types.ts';

/** Terse way to spell a list of options that need nothing but a label. */
export function vals(...specs: (string | OptionValue)[]): OptionValue[] {
  return specs.map((s) =>
    typeof s === 'string' ? { id: slug(s), label: s } : { id: s.id || slug(s.label), label: s.label, note: s.note, tags: s.tags },
  );
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Temperature — near-universal, so it lives here rather than in every brand. */
export const TEMPERATURE: OptionGroup = {
  id: 'temp',
  label: 'Temperature',
  kind: 'single',
  values: vals('Hot', 'Iced', 'Blended', 'Room temperature'),
  fallback: 'hot',
};

export const ICE: OptionGroup = {
  id: 'ice',
  label: 'Ice',
  kind: 'scale',
  hint: 'Only applies to cold drinks.',
  values: vals('No ice', 'Light ice', 'Regular ice', 'Extra ice'),
  fallback: 'regular-ice',
};

export const SWEETNESS: OptionGroup = {
  id: 'sweetness',
  label: 'Sweetness',
  kind: 'scale',
  hint: 'Shops that pour to a percentage will honour these directly.',
  values: vals('0% — unsweetened', '25% — barely', '50% — half sweet', '75% — most of the way', '100% — standard', '125% — extra sweet'),
  fallback: '100-standard',
};

export const CUP: OptionGroup = {
  id: 'cup',
  label: 'Cup',
  kind: 'single',
  advanced: true,
  values: vals('House cup', 'Bring my own tumbler', 'For here / ceramic', 'Double-cupped', 'With a sleeve'),
  fallback: 'house-cup',
};

export const LID: OptionGroup = {
  id: 'lid',
  label: 'Lid & straw',
  kind: 'multi',
  advanced: true,
  values: vals('Lid on', 'No lid', 'Straw please', 'No straw', 'Stopper in the lid'),
  fallback: ['lid-on'],
};

export const NOTES: OptionGroup = {
  id: 'notes',
  label: 'Anything else',
  kind: 'text',
  hint: 'The bit you always say out loud at the counter.',
};

/** Groups every drink at every brand gets, appended automatically. */
export const UNIVERSAL_GROUPS: OptionGroup[] = [CUP, LID, NOTES];
export const UNIVERSAL_GROUP_IDS = UNIVERSAL_GROUPS.map((g) => g.id);

/** Standard dairy + alternatives, reused with per-brand trimming. */
export function milkGroup(available: string[], fallback = 'whole-milk'): OptionGroup {
  const all: Record<string, OptionValue> = {
    'whole-milk': { id: 'whole-milk', label: 'Whole milk', tags: ['dairy'] },
    '2-milk': { id: '2-milk', label: '2% milk', tags: ['dairy'] },
    'nonfat-milk': { id: 'nonfat-milk', label: 'Nonfat / skim milk', tags: ['dairy'] },
    'half-and-half': { id: 'half-and-half', label: 'Half & half', note: 'Breve if used in place of milk', tags: ['dairy'] },
    'heavy-cream': { id: 'heavy-cream', label: 'Heavy cream', tags: ['dairy'] },
    cream: { id: 'cream', label: 'Cream', tags: ['dairy'] },
    'oat-milk': { id: 'oat-milk', label: 'Oat milk', tags: ['dairy-free', 'gluten'] },
    'almond-milk': { id: 'almond-milk', label: 'Almond milk', tags: ['dairy-free', 'nut'] },
    'soy-milk': { id: 'soy-milk', label: 'Soy milk', tags: ['dairy-free', 'soy'] },
    'coconut-milk': { id: 'coconut-milk', label: 'Coconut milk', tags: ['dairy-free'] },
    'lactose-free': { id: 'lactose-free', label: 'Lactose-free milk', tags: ['dairy'] },
    'no-milk': { id: 'no-milk', label: 'No milk — black', tags: ['dairy-free'] },
    'milk-on-side': { id: 'milk-on-side', label: 'Milk on the side', tags: ['dairy'] },
  };
  return {
    id: 'milk',
    label: 'Milk',
    kind: 'single',
    values: available.map((id) => all[id]).filter(Boolean),
    fallback,
  };
}

/** Sweeteners that get stirred in rather than pumped. */
export const SWEETENER: OptionGroup = {
  id: 'sweetener',
  label: 'Sweetener',
  kind: 'multi',
  values: vals(
    { id: 'none', label: 'None', tags: ['sugar-free'] },
    { id: 'sugar', label: 'Sugar', tags: ['sugar'] },
    { id: 'raw-sugar', label: 'Raw / turbinado sugar', tags: ['sugar'] },
    { id: 'liquid-cane', label: 'Liquid cane sugar', tags: ['sugar'] },
    { id: 'honey', label: 'Honey', tags: ['sugar'] },
    { id: 'agave', label: 'Agave', tags: ['sugar'] },
    { id: 'splenda', label: 'Splenda (sucralose)', tags: ['sugar-free'] },
    { id: 'equal', label: 'Equal (aspartame)', tags: ['sugar-free'] },
    { id: 'sweet-n-low', label: "Sweet'N Low (saccharin)", tags: ['sugar-free'] },
    { id: 'stevia', label: 'Stevia', tags: ['sugar-free'] },
    { id: 'monk-fruit', label: 'Monk fruit', tags: ['sugar-free'] },
  ),
  fallback: ['none'],
};

export const SWEETENER_COUNT: OptionGroup = {
  id: 'sweetener_count',
  label: 'How many',
  kind: 'count',
  hint: 'Packets, or pumps of liquid sugar.',
  min: 0,
  max: 10,
  fallback: 0,
  advanced: true,
};

export const CAFFEINE: OptionGroup = {
  id: 'caffeine',
  label: 'Caffeine',
  kind: 'single',
  values: vals(
    { id: 'regular', label: 'Regular', tags: ['caffeine'] },
    { id: 'half-caf', label: 'Half-caf', tags: ['caffeine'] },
    { id: 'decaf', label: 'Decaf', tags: ['decaf'] },
  ),
  fallback: 'regular',
};
