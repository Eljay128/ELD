import type { Daypart, DietTag } from '../catalog/types.ts';

/** A single saved drink order inside a profile. */
export interface Order {
  id: string;
  brandId: string;
  drinkId: string;
  /** Which time of day this order belongs to. Drives the profile's sections. */
  daypart: Daypart;
  /** When this one applies: "every day", "road trip", "sick day"… */
  occasions: string[];
  /** groupId → selected value(s). Numbers for `count`, string[] for `multi`. */
  choices: Record<string, string | string[] | number>;
  /** Ranked 1 = the go-to order for this daypart. */
  favorite: boolean;
  /** Free text the member wants peers to see with this order. */
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export const OCCASIONS: { id: string; label: string; emoji: string }[] = [
  { id: 'everyday', label: 'Every day', emoji: '📅' },
  { id: 'treat', label: 'Treat / reward', emoji: '🎁' },
  { id: 'work', label: 'At work', emoji: '💼' },
  { id: 'meeting', label: 'Meetings & coffee runs', emoji: '🗣️' },
  { id: 'commute', label: 'Commute', emoji: '🚗' },
  { id: 'road-trip', label: 'Road trip', emoji: '🛣️' },
  { id: 'study', label: 'Studying / deep work', emoji: '📚' },
  { id: 'post-workout', label: 'Post-workout', emoji: '🏋️' },
  { id: 'brunch', label: 'Brunch', emoji: '🥞' },
  { id: 'with-dessert', label: 'With dessert', emoji: '🍰' },
  { id: 'celebration', label: 'Celebration', emoji: '🎉' },
  { id: 'sick-day', label: 'Sick day', emoji: '🤒' },
  { id: 'hot-weather', label: 'Hot weather', emoji: '🥵' },
  { id: 'cold-weather', label: 'Cold weather', emoji: '🧣' },
  { id: 'nightcap', label: 'Nightcap', emoji: '🌃' },
  { id: 'hosting', label: 'When someone hosts me', emoji: '🏡' },
  { id: 'gift', label: 'If you are buying me one', emoji: '💝' },
];

export const DIET_FLAGS: { id: DietTag; label: string; warn: string }[] = [
  { id: 'dairy-free', label: 'Dairy-free', warn: 'contains dairy' },
  { id: 'nut', label: 'Nut allergy', warn: 'contains nuts' },
  { id: 'soy', label: 'Avoids soy', warn: 'contains soy' },
  { id: 'gluten', label: 'Avoids gluten', warn: 'may contain gluten' },
  { id: 'sugar-free', label: 'Low / no sugar', warn: 'is sweetened' },
  { id: 'decaf', label: 'Caffeine-sensitive', warn: 'is caffeinated' },
  { id: 'zero-proof', label: 'No alcohol', warn: 'contains alcohol' },
];

/** The whole shareable payload for one member. */
export interface Profile {
  /** Stable id, generated once. Peers key their copy off this. */
  id: string;
  name: string;
  handle?: string;
  emoji: string;
  /** One line peers see under the name. */
  tagline?: string;
  /** Hard constraints — rendered as warnings, not silent filters. */
  diet: DietTag[];
  /** Free text for anything the flags cannot express, e.g. a real allergy. */
  allergyNote?: string;
  /** Things that should never be brought, in the member's own words. */
  dislikes: string[];
  orders: Order[];
  /** Bumped on every edit so peers can tell which copy is newer. */
  version: number;
  updatedAt: number;
}

/** A peer's profile as stored locally, plus how it got here. */
export interface Peer {
  profile: Profile;
  /** How the member labels this person: friend, family, coworker… */
  circle: Circle;
  importedAt: number;
  source: 'link' | 'code' | 'qr' | 'file' | 'p2p' | 'sample';
}

export type Circle = 'friends' | 'family' | 'coworkers' | 'other';

export const CIRCLES: { id: Circle; label: string; emoji: string }[] = [
  { id: 'friends', label: 'Friends', emoji: '🫂' },
  { id: 'family', label: 'Family', emoji: '👪' },
  { id: 'coworkers', label: 'Coworkers', emoji: '💼' },
  { id: 'other', label: 'Other', emoji: '🌐' },
];

export interface AppState {
  me: Profile;
  peers: Peer[];
  /** Ids of peers currently selected for a coffee run. */
  runSelection: string[];
}

export function newId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}

export function emptyProfile(): Profile {
  return {
    id: newId(),
    name: '',
    emoji: '☕',
    diet: [],
    dislikes: [],
    orders: [],
    version: 1,
    updatedAt: Date.now(),
  };
}
