/**
 * The catalog describes *what can be ordered and how it can be customized*.
 * It is static reference data — a member's actual choices live in `src/model`.
 *
 * The shape is deliberately generic: every brand is described with the same
 * primitives, so the editor UI can render any brand (present or future) without
 * brand-specific code.
 */

/** Time-of-day buckets a drink belongs to. A drink may sit in several. */
export type Daypart = 'morning' | 'day' | 'evening' | 'adult';

export const DAYPARTS: { id: Daypart; label: string; blurb: string; emoji: string }[] = [
  { id: 'morning', label: 'Morning', blurb: 'Wake-up drinks, the first cup, the commute order', emoji: '🌅' },
  { id: 'day', label: 'Day', blurb: 'Midday pick-me-ups, lunch drinks, the 3pm slump', emoji: '☀️' },
  { id: 'evening', label: 'Evening', blurb: 'Wind-down, dessert drinks, decaf and herbal', emoji: '🌙' },
  { id: 'adult', label: 'Adult', blurb: 'Beer, wine, spirits, cocktails — and their zero-proof twins', emoji: '🍸' },
];

/** How a customization group is chosen. Drives which control the editor renders. */
export type OptionKind =
  /** Exactly one value. Rendered as a segmented control or select. */
  | 'single'
  /** Any number of values. Rendered as toggle chips. */
  | 'multi'
  /** A whole number within a range, e.g. espresso shots or syrup pumps. */
  | 'count'
  /** A position on a labelled scale, e.g. ice level or sweetness. */
  | 'scale'
  /** Free text, e.g. "ask for it extra hot, 180°". */
  | 'text';

export interface OptionValue {
  id: string;
  label: string;
  /** Shown under the label in the editor — house terminology, caveats, etc. */
  note?: string;
  /** Dietary tags this value satisfies or violates. Used for conflict warnings. */
  tags?: DietTag[];
}

export type DietTag =
  | 'dairy'
  | 'dairy-free'
  | 'nut'
  | 'soy'
  | 'gluten'
  | 'caffeine'
  | 'decaf'
  | 'sugar'
  | 'sugar-free'
  | 'alcohol'
  | 'zero-proof';

export interface OptionGroup {
  id: string;
  label: string;
  kind: OptionKind;
  /** Short helper text shown beneath the group heading. */
  hint?: string;
  /** For `single` / `multi` / `scale`. Scales are ordered low → high. */
  values?: OptionValue[];
  /** For `count`. */
  min?: number;
  max?: number;
  /** Default selection: an option id, an array of ids, or a number. */
  fallback?: string | string[] | number;
  /**
   * Groups tagged `advanced` are folded behind a "more options" disclosure so the
   * common path stays short while the full option set is still reachable.
   */
  advanced?: boolean;
}

export interface Drink {
  id: string;
  name: string;
  /** e.g. "Espresso", "Brewed coffee", "Refreshers". Used to group the picker. */
  family: string;
  dayparts: Daypart[];
  /** Option group ids from the owning brand that apply to this drink. */
  groups: string[];
  note?: string;
  tags?: DietTag[];
  /** Seasonal / limited-time item — surfaced so peers know it may be unavailable. */
  seasonal?: boolean;
}

export interface Brand {
  id: string;
  name: string;
  /** Short label for chips and the barista card. */
  short: string;
  emoji: string;
  /** Accent colour used for the brand chip, as an `oklch()`-friendly hue. */
  hue: number;
  blurb: string;
  groups: OptionGroup[];
  drinks: Drink[];
  /** Where the option data came from, so it can be re-checked when menus change. */
  sources?: string[];
}
