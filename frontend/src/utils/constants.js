/**
 * Frontend constants — mirrors backend category codes and default config.
 */

export const CATEGORIES = [
  {
    code: 'FOLLOWING',
    label: 'Being Followed',
    emoji: '👤',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.18)',
  },
  {
    code: 'HARASSMENT',
    label: 'Harassment',
    emoji: '⚠️',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.18)',
  },
  {
    code: 'POOR_LIGHTING',
    label: 'Poor Lighting',
    emoji: '🌑',
    color: '#eab308',
    bg: 'rgba(234,179,8,0.18)',
  },
  {
    code: 'DESERTED_AREA',
    label: 'Deserted Area',
    emoji: '🌫️',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.18)',
  },
  {
    code: 'UNSAFE_TRANSIT',
    label: 'Unsafe Transit',
    emoji: '🚏',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.18)',
  },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));

export const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 }; // Kolkata (per user's region)
export const DEFAULT_ZOOM = 15;
export const HAZARD_RADIUS_M = 2000;

/** Time in ms after which a hazard's freshness dot turns from green to yellow */
export const FRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 min
