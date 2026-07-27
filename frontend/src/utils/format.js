/**
 * Formatting helpers: relative time, distance, and coordinate strings.
 */

/**
 * Human-friendly relative time ("12 mins ago", "just now", "2h ago").
 */
export function relativeTime(isoString) {
  const then = new Date(isoString).getTime();
  const diffMs = Date.now() - then;
  if (Number.isNaN(diffMs)) return '';
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 min ago';
  if (sec < 60 * 45) return `${Math.round(sec / 60)} mins ago`;
  if (sec < 60 * 90) return '1 hr ago';
  if (sec < 60 * 60 * 22) return `${Math.round(sec / 3600)} hrs ago`;
  if (sec < 60 * 60 * 42) return '1 day ago';
  return `${Math.round(sec / 86400)} days ago`;
}

/**
 * Human-friendly distance string ("45 m", "1.2 km").
 */
export function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
