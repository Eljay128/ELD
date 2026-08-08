/**
 * Validates the sample profiles against the catalog.
 *
 * A mistyped option id does not throw — it just silently vanishes from the
 * rendered order, which is the worst kind of bug here: the profile looks fine
 * and quietly means something else. This catches that at build time.
 *
 *   node --experimental-strip-types scripts/check-catalog.ts
 */

import { BRANDS, getBrand, getDrink, groupsForDrink } from '../src/catalog/index.ts';
import { SAMPLE_PEERS } from '../src/model/samples.ts';
import { OCCASIONS } from '../src/model/types.ts';

const problems: string[] = [];
const occasionIds = new Set(OCCASIONS.map((o) => o.id));

// --- the catalog itself must be internally consistent ----------------------

for (const brand of BRANDS) {
  const groupIds = new Set(brand.groups.map((g) => g.id));
  const seenDrink = new Set<string>();

  for (const group of brand.groups) {
    const seen = new Set<string>();
    for (const value of group.values ?? []) {
      if (seen.has(value.id)) problems.push(`${brand.id}/${group.id}: duplicate value id "${value.id}"`);
      seen.add(value.id);
    }
    if (group.kind === 'count' && (group.min === undefined || group.max === undefined)) {
      problems.push(`${brand.id}/${group.id}: count group needs min and max`);
    }
    if ((group.kind === 'single' || group.kind === 'scale') && typeof group.fallback === 'string' && !seen.has(group.fallback)) {
      problems.push(`${brand.id}/${group.id}: fallback "${group.fallback}" is not one of its values`);
    }
    if (Array.isArray(group.fallback)) {
      for (const f of group.fallback) {
        if (!seen.has(f)) problems.push(`${brand.id}/${group.id}: fallback "${f}" is not one of its values`);
      }
    }
  }

  for (const drink of brand.drinks) {
    if (seenDrink.has(drink.id)) problems.push(`${brand.id}: duplicate drink id "${drink.id}"`);
    seenDrink.add(drink.id);
    if (drink.dayparts.length === 0) problems.push(`${brand.id}/${drink.id}: belongs to no daypart`);
    for (const g of drink.groups) {
      if (!groupIds.has(g)) problems.push(`${brand.id}/${drink.id}: references unknown group "${g}"`);
    }
  }
}

// --- sample profiles must reference things that exist ----------------------

for (const profile of SAMPLE_PEERS) {
  for (const order of profile.orders) {
    const where = `${profile.name}/${order.drinkId}`;
    const brand = getBrand(order.brandId);
    if (!brand) {
      problems.push(`${where}: unknown brand "${order.brandId}"`);
      continue;
    }
    if (!getDrink(order.brandId, order.drinkId)) {
      problems.push(`${where}: unknown drink in ${order.brandId}`);
      continue;
    }
    for (const occasion of order.occasions) {
      if (!occasionIds.has(occasion)) problems.push(`${where}: unknown occasion "${occasion}"`);
    }

    const groups = new Map(groupsForDrink(order.brandId, order.drinkId).map((g) => [g.id, g]));
    for (const [groupId, choice] of Object.entries(order.choices)) {
      const group = groups.get(groupId);
      if (!group) {
        problems.push(`${where}: group "${groupId}" does not apply to this drink`);
        continue;
      }
      if (group.kind === 'count') {
        const n = Number(choice);
        if (!Number.isInteger(n) || n < (group.min ?? 0) || n > (group.max ?? 99)) {
          problems.push(`${where}/${groupId}: ${choice} is outside ${group.min}–${group.max}`);
        }
        continue;
      }
      if (group.kind === 'text') continue;
      const ids = Array.isArray(choice) ? choice : [String(choice)];
      const valid = new Set((group.values ?? []).map((v) => v.id));
      for (const id of ids) {
        if (!valid.has(id)) {
          problems.push(`${where}/${groupId}: "${id}" is not a valid option — have ${[...valid].slice(0, 6).join(', ')}…`);
        }
      }
      if (!Array.isArray(choice) && group.kind === 'multi') {
        problems.push(`${where}/${groupId}: multi group needs an array`);
      }
    }
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} catalog problem${problems.length === 1 ? '' : 's'}:\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

const drinks = BRANDS.reduce((n, b) => n + b.drinks.length, 0);
const values = BRANDS.reduce((n, b) => n + b.groups.reduce((m, g) => m + (g.values?.length ?? 0), 0), 0);
console.log(`✓ catalog consistent — ${BRANDS.length} brands, ${drinks} drinks, ${values} option values`);
console.log(`✓ ${SAMPLE_PEERS.length} sample profiles reference only real options`);
