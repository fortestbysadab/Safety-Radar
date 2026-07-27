/**
 * services/geo.js
 * ---------------
 * Geospatial helpers:
 *   - haversineDistance: point-to-point great-circle distance in meters (used
 *     for the 100m geofence check — avoids a DB round-trip to validate pins).
 *   - buildHeatmapClusters: aggregates active hazard reports into red/yellow
 *     heatmap points for the Leaflet `leaflet.heat` overlay.
 *   - toPoint: wraps lat/lng into a GeoJSON-ish {lat, lng} for ST_MakePoint calls.
 */

const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two WGS84 points using the haversine formula.
 * Accurate to ~0.5% — more than enough for a 100m geofence check.
 * @returns {number} distance in meters
 */
export function haversineDistance(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Validate that a {lat,lng} object is within valid WGS84 bounds. */
export function isValidLatLng(p) {
  return (
    p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 && p.lat <= 90 &&
    p.lng >= -180 && p.lng <= 180
  );
}

/**
 * Cluster active hazards into heatmap intensities.
 *
 * A simple grid-based cluster (not DBSCAN, but fast and deterministic):
 *   - Group hazards into ~80m grid cells (~0.00072° lat at the equator).
 *   - Each cell's intensity = weighted count of hazards inside it.
 *     * HARASSMENT / FOLLOWING -> weight 1.0
 *     * POOR_LIGHTING / UNSAFE_TRANSIT / DESERTED_AREA -> weight 0.6
 *   - Cells with cumulative weight >= 3 in the last 2 hours -> RED (intensity 1.0)
 *     Cells with cumulative weight >= 1                           -> YELLOW (intensity scaled)
 *
 * @param {Array<{lat:number,lng:number,category:string,created_at:string|Date}>} hazards
 * @returns {Array<[number,number,number]>} Array of [lat, lng, intensity] for leaflet.heat
 */
export function buildHeatmapClusters(hazards) {
  const CELL_SIZE_DEG = 0.00072; // ~80m at the equator
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();

  const weights = {
    FOLLOWING: 1.0,
    HARASSMENT: 1.0,
    POOR_LIGHTING: 0.6,
    DESERTED_AREA: 0.6,
    UNSAFE_TRANSIT: 0.6,
  };

  const cells = new Map();

  for (const h of hazards) {
    const ageMs = now - new Date(h.created_at).getTime();
    if (ageMs < 0) continue; // future-dated -> ignore

    // Linear decay: recent reports contribute full weight, dropping to 0 at expiry.
    const recency = Math.max(0, 1 - ageMs / (4 * 60 * 60 * 1000)); // decays over 4h
    const w = (weights[h.category] ?? 0.5) * recency;

    const cellLat = Math.floor(h.lat / CELL_SIZE_DEG) * CELL_SIZE_DEG;
    const cellLng = Math.floor(h.lng / CELL_SIZE_DEG) * CELL_SIZE_DEG;
    const key = `${cellLat.toFixed(5)}|${cellLng.toFixed(5)}`;

    const prev = cells.get(key) ?? { latSum: 0, lngSum: 0, weight: 0, recentCount: 0 };
    prev.latSum += h.lat * w;
    prev.lngSum += h.lng * w;
    prev.weight += w;
    if (ageMs < TWO_HOURS_MS) prev.recentCount += 1;
    cells.set(key, prev);
  }

  const points = [];
  for (const c of cells.values()) {
    const lat = c.latSum / c.weight;
    const lng = c.lngSum / c.weight;

    // Normalize intensity to 0..1 for leaflet.heat.
    // >=3 recent hazards in cell -> 1.0 (red); scale smoothly otherwise.
    let intensity = Math.min(1, c.weight / 3);
    if (c.recentCount >= 3) intensity = 1.0;
    if (intensity < 0.1) continue; // filter noise

    points.push([lat, lng, Number(intensity.toFixed(3))]);
  }

  return points;
}
