import { getBrand, getDrink, getGroup, groupsForDrink } from '../catalog/index.ts';
import type { DietTag, OptionGroup } from '../catalog/types.ts';
import type { Order, Profile } from './types.ts';
import { DIET_FLAGS } from './types.ts';

/**
 * Turning stored choices back into something a human says out loud.
 *
 * The ordering rule mirrors how drinks are actually called out at a counter:
 * size, then temperature, then the drink, then the modifications. That way the
 * generated line reads naturally instead of like a form dump.
 */

const LEAD_GROUPS = ['size', 'temp'];
const SKIP_VALUES = new Set(['none', 'no-preference', 'whatever', 'standard', 'not-necessary', 'no-limits-worth-mentioning', 'whatever-they-pour', 'any-boba-shop', 'any-juice-bar']);

/**
 * Groups whose house default is worth saying out loud anyway. Size leads the
 * order regardless, and milk is the single most common thing to get wrong — a
 * peer reading "oat milk" and a peer reading nothing behave differently at the
 * counter, so it is stated even when it matches the shop's default.
 */
const ALWAYS_STATE = new Set(['size', 'milk']);

/** True when a selection is exactly what the shop would pour without being asked. */
function isDefault(group: OptionGroup, raw: string | string[] | number): boolean {
  if (group.fallback === undefined) return false;
  if (Array.isArray(group.fallback) && Array.isArray(raw)) {
    return group.fallback.length === raw.length && group.fallback.every((v) => raw.includes(v));
  }
  return group.fallback === raw;
}

export interface FormattedOrder {
  /** The one-line version: "Grande iced Caffè Latte, oat milk, 2 pumps vanilla". */
  line: string;
  /** Each modification as its own phrase, for list rendering. */
  mods: string[];
  brandName: string;
  brandEmoji: string;
  drinkName: string;
  /** Diet tags implied by the selected options — used to check against a profile. */
  tags: DietTag[];
}

export function formatOrder(order: Order): FormattedOrder {
  const brand = getBrand(order.brandId);
  const drink = getDrink(order.brandId, order.drinkId);
  if (!brand || !drink) {
    return { line: 'Unknown drink', mods: [], brandName: order.brandId, brandEmoji: '❓', drinkName: order.drinkId, tags: [] };
  }

  const groups = groupsForDrink(order.brandId, order.drinkId);
  const lead: string[] = [];
  const mods: string[] = [];
  const tags = new Set<DietTag>(drink.tags ?? []);

  for (const group of groups) {
    const raw = order.choices[group.id];
    const phrase = phraseFor(group, raw, tags);
    if (!phrase) continue;
    if (LEAD_GROUPS.includes(group.id)) lead.push(phrase);
    else mods.push(phrase);
  }

  const head = [...lead, drink.name].join(' ');
  const line = mods.length ? `${head} — ${mods.join(', ')}` : head;
  return { line, mods, brandName: brand.name, brandEmoji: brand.emoji, drinkName: drink.name, tags: [...tags] };
}

function phraseFor(
  group: OptionGroup,
  raw: string | string[] | number | undefined,
  tags: Set<DietTag>,
): string | null {
  if (raw === undefined || raw === null || raw === '') return null;

  if (group.kind === 'count') {
    const n = Number(raw);
    if (!n) return null;
    return `${n} ${countNoun(group, n)}`;
  }

  if (group.kind === 'text') {
    return String(raw);
  }

  const ids = Array.isArray(raw) ? raw : [String(raw)];
  const labels: string[] = [];
  for (const id of ids) {
    const value = group.values?.find((v) => v.id === id);
    if (!value) continue;
    // Dietary tags are collected even for options we will not print, so a
    // default dairy milk still trips the owner's dairy-free warning.
    for (const t of value.tags ?? []) tags.add(t);
    if (SKIP_VALUES.has(id)) continue;
    labels.push(group.id === 'size' ? stripSizeSuffix(value.label) : value.label);
  }
  if (labels.length === 0) return null;

  // A spoken order names what is *different*. Reciting the house default —
  // "signature roast, regular ice, lid on" — buries the parts that matter.
  if (!ALWAYS_STATE.has(group.id) && isDefault(group, raw)) return null;

  // Lead groups read as bare adjectives ("Grande iced"); everything else keeps
  // its group name only when the value alone would be ambiguous.
  if (LEAD_GROUPS.includes(group.id)) return labels.join(' ');
  const prefix = SPEAK_AS[group.id];
  if (prefix) return `${prefix}: ${labels.join(' + ')}`;
  return labels.join(', ');
}

/**
 * "Grande — 16 oz" reads better as just "Grande". Only sizes get trimmed —
 * elsewhere the text after the dash carries the meaning, and dropping it turns
 * "Strong — 5 minutes" into a bare "Strong".
 */
function stripSizeSuffix(label: string): string {
  return label.replace(/\s+—\s+.*$/, '');
}

/**
 * Groups whose value is ambiguous standing alone — "A splash" of what? — get a
 * short prefix. These are deliberately terse nouns rather than the group's UI
 * label: "How much milk" is a good question to ask a member and a bad thing to
 * read off a list at a counter.
 */
const SPEAK_AS: Record<string, string> = {
  milk_amount: 'milk',
  dairy_amount: 'dairy',
  steep: 'steep',
  roast: 'roast',
  brew_method: 'brew',
  blend: 'blend',
  texture: 'texture',
  serve: 'served',
  ice_style: 'ice',
  topping_amount: 'toppings',
  occasion_note: 'note',
  hard_no: 'never',
  flavor_profile: 'style',
};

function countNoun(group: OptionGroup, n: number): string {
  const base = {
    shots: 'shot',
    syrup_pumps: 'pump',
    pumps: 'pump',
    sweetener_count: 'sweetener',
    cream_count: 'cream',
    sugar_count: 'sugar',
  }[group.id];
  if (!base) return group.label.toLowerCase();
  return n === 1 ? base : `${base}s`;
}

/** The full barista card: one order rendered as a heading plus bullet list. */
export function orderCard(order: Order): { title: string; brand: string; bullets: string[] } {
  const f = formatOrder(order);
  return {
    title: f.drinkName,
    brand: `${f.brandEmoji} ${f.brandName}`,
    bullets: f.mods,
  };
}

/**
 * Cross-check an order against the owner's stated dietary constraints.
 * These surface as visible warnings rather than blocking the save — people know
 * their own bodies, and "dairy-free except for my Friday treat" is a real thing.
 */
export function dietConflicts(profile: Profile, order: Order): string[] {
  const { tags } = formatOrder(order);
  const out: string[] = [];
  for (const flag of DIET_FLAGS) {
    if (!profile.diet.includes(flag.id)) continue;
    const trigger = conflictTag(flag.id);
    if (trigger && tags.includes(trigger)) {
      out.push(`Marked ${flag.label.toLowerCase()}, but this order ${flag.warn}.`);
    }
  }
  return out;
}

function conflictTag(flag: DietTag): DietTag | null {
  switch (flag) {
    case 'dairy-free':
      return 'dairy';
    case 'sugar-free':
      return 'sugar';
    case 'decaf':
      return 'caffeine';
    case 'zero-proof':
      return 'alcohol';
    case 'nut':
      return 'nut';
    case 'soy':
      return 'soy';
    case 'gluten':
      return 'gluten';
    default:
      return null;
  }
}

/** Plain-text export of a whole profile — pasteable into any chat app. */
export function profileToText(profile: Profile): string {
  const lines: string[] = [`${profile.emoji} ${profile.name || 'Unnamed'}${profile.handle ? ` (${profile.handle})` : ''}`];
  if (profile.tagline) lines.push(profile.tagline);
  if (profile.diet.length) {
    lines.push(`Dietary: ${profile.diet.map((d) => DIET_FLAGS.find((f) => f.id === d)?.label ?? d).join(', ')}`);
  }
  if (profile.allergyNote) lines.push(`Allergies: ${profile.allergyNote}`);
  if (profile.dislikes.length) lines.push(`Never bring: ${profile.dislikes.join('; ')}`);
  lines.push('');
  for (const order of profile.orders) {
    const f = formatOrder(order);
    lines.push(`• [${order.daypart}] ${f.brandName}: ${f.line}${order.favorite ? '  ★' : ''}`);
    if (order.note) lines.push(`    "${order.note}"`);
  }
  return lines.join('\n');
}

/** Consolidated order list for a coffee run — grouped by shop. */
export function runSheet(entries: { who: string; order: Order }[]): { brand: string; lines: string[] }[] {
  const byBrand = new Map<string, string[]>();
  for (const { who, order } of entries) {
    const f = formatOrder(order);
    const key = `${f.brandEmoji} ${f.brandName}`;
    const line = `${who}: ${f.line}`;
    const list = byBrand.get(key);
    if (list) list.push(line);
    else byBrand.set(key, [line]);
  }
  return [...byBrand].map(([brand, lines]) => ({ brand, lines }));
}

export function groupLabel(brandId: string, groupId: string): string {
  return getGroup(brandId, groupId)?.label ?? groupId;
}
