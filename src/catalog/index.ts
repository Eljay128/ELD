import type { Brand, Daypart, Drink, OptionGroup } from './types.ts';
import { UNIVERSAL_GROUPS, UNIVERSAL_GROUP_IDS } from './shared.ts';
import { starbucks } from './starbucks.ts';
import { dunkin } from './dunkin.ts';
import { dutchBros, timHortons, localCafe, fastFood } from './chains.ts';
import { teahouse, juiceBar } from './teahouse.ts';
import { bar } from './bar.ts';
import { home } from './home.ts';

/**
 * Every brand gets the universal groups (cup, lid, free-text note) appended to
 * its own group list, and every drink gets those group ids appended to its own,
 * so a member can always add the detail the menu structure did not anticipate.
 */
function withUniversals(brand: Brand): Brand {
  return {
    ...brand,
    groups: [...brand.groups, ...UNIVERSAL_GROUPS],
    drinks: brand.drinks.map((drink) => ({ ...drink, groups: [...drink.groups, ...UNIVERSAL_GROUP_IDS] })),
  };
}

export const BRANDS: Brand[] = [
  starbucks,
  dunkin,
  dutchBros,
  timHortons,
  localCafe,
  fastFood,
  teahouse,
  juiceBar,
  home,
  bar,
].map(withUniversals);

const BY_ID = new Map(BRANDS.map((b) => [b.id, b]));

export function getBrand(id: string): Brand | undefined {
  return BY_ID.get(id);
}

export function getDrink(brandId: string, drinkId: string): Drink | undefined {
  return BY_ID.get(brandId)?.drinks.find((d) => d.id === drinkId);
}

export function getGroup(brandId: string, groupId: string): OptionGroup | undefined {
  return BY_ID.get(brandId)?.groups.find((g) => g.id === groupId);
}

/** The option groups that apply to one drink, in the brand's declared order. */
export function groupsForDrink(brandId: string, drinkId: string): OptionGroup[] {
  const brand = BY_ID.get(brandId);
  const drink = brand?.drinks.find((d) => d.id === drinkId);
  if (!brand || !drink) return [];
  const wanted = new Set(drink.groups);
  return brand.groups.filter((g) => wanted.has(g.id));
}

export function labelFor(brandId: string, groupId: string, valueId: string): string {
  const group = getGroup(brandId, groupId);
  return group?.values?.find((v) => v.id === valueId)?.label ?? valueId;
}

/** Drinks in a brand that suit a given time of day. */
export function drinksForDaypart(brand: Brand, daypart: Daypart | 'all'): Drink[] {
  if (daypart === 'all') return brand.drinks;
  return brand.drinks.filter((d) => d.dayparts.includes(daypart));
}

/** Group a brand's drinks by family for the picker's section headings. */
export function drinksByFamily(drinks: Drink[]): { family: string; drinks: Drink[] }[] {
  const map = new Map<string, Drink[]>();
  for (const drink of drinks) {
    const list = map.get(drink.family);
    if (list) list.push(drink);
    else map.set(drink.family, [drink]);
  }
  return [...map].map(([family, list]) => ({ family, drinks: list }));
}

/** Total option combinations across the catalog — used for the "depth" stat. */
export function catalogStats() {
  const drinks = BRANDS.reduce((n, b) => n + b.drinks.length, 0);
  const options = BRANDS.reduce(
    (n, b) => n + b.groups.reduce((m, g) => m + (g.values?.length ?? (g.max ?? 0) - (g.min ?? 0) + 1), 0),
    0,
  );
  return { brands: BRANDS.length, drinks, options };
}

export * from './types.ts';
export { DAYPARTS } from './types.ts';
