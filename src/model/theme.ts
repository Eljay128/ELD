/**
 * Theme selection.
 *
 * The viewer has three states, not two: an explicit choice, or "follow the
 * system" — which stamps nothing and lets `prefers-color-scheme` decide. This
 * module owns the stamp; the palette itself lives entirely in CSS.
 */

const KEY = 'pourfolio.theme.v1';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: { id: ThemeChoice; label: string; hint: string }[] = [
  { id: 'system', label: 'System', hint: 'Follow whatever this device is set to.' },
  { id: 'light', label: 'Light', hint: 'Sunlight on parchment.' },
  { id: 'dark', label: 'Dark', hint: 'Amber wash over near-black.' },
];

let choice: ThemeChoice = load();
const listeners = new Set<() => void>();

function load(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Storage unavailable — following the system is the safe default.
  }
  return 'system';
}

/** Apply the stamp. "system" removes it so the media query takes over. */
function apply(): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function initTheme(): void {
  apply();
  // Re-render when the OS flips while "system" is selected, so anything reading
  // `resolvedTheme` stays truthful.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (choice === 'system') for (const l of listeners) l();
  });
}

export function setTheme(next: ThemeChoice): void {
  choice = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // The choice still applies for this session.
  }
  apply();
  for (const l of listeners) l();
}

export function themeChoice(): ThemeChoice {
  return choice;
}

/** What is actually on screen right now, with "system" resolved. */
export function resolvedTheme(): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
