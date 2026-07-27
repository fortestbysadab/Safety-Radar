/**
 * components/Map/SafetyMap.jsx
 * ----------------------------
 * Leaflet-based safety map. Renders:
 *   - CartoDB Dark Matter base tiles (dark theme, no API key required).
 *   - Live heatmap overlay (leaflet.heat) from GET /api/hazards/heatmap.
 *   - Individual hazard markers (category-colored pins) from GET /api/hazards.
 *   - A pulsing blue marker at the user's current location.
 *
 * Data refresh: re-fetches hazards + heatmap whenever the map center moves
 * significantly, or whenever a manual refresh is triggered (e.g., after
 * submitting a new report).
 */
import { useEffect, useImperativeHandle, useRef, forwardRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { CATEGORY_MAP, DEFAULT_CENTER, DEFAULT_ZOOM, HAZARD_RADIUS_M } from '../../utils/constants';
import { fetchHazards, fetchHeatmap } from '../../services/api';

/** Build a category-colored Leaflet divIcon for a hazard marker. */
function hazardIcon(category) {
  const cat = CATEGORY_MAP[category] ?? { emoji: '⚠️', color: '#ef4444' };
  return L.divIcon({
    className: 'hazard-marker-wrap',
    html: `<div class="hazard-marker" style="background:${cat.color}"><span>${cat.emoji}</span></div>`,
    iconSize: [34, 40],
    iconAnchor: [17, 38],
    popupAnchor: [0, -38],
  });
}

function userIcon() {
  return L.divIcon({
    className: 'user-marker-wrap',
    html: `<div class="user-pulse"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Controller child: lives inside <MapContainer>, gets access to the leaflet
 * map instance via useMap(), sets up the heatmap layer, handles refresh-on-move
 * and panto-to-user, and exposes an API up via the imperative ref.
 */
const MapController = forwardRef(function MapController(
  { userLocation, onHazardsLoaded, onSelectHazard },
  ref
) {
  const map = useMap();
  const heatLayerRef = useRef(null);
  const markerLayerRef = useRef(L.layerGroup());
  const lastFetchCenter = useRef(null);

  // Attach the hazard marker layer once.
  useEffect(() => {
    markerLayerRef.current.addTo(map);
    return () => map.removeLayer(markerLayerRef.current);
  }, [map]);

  // Fly to user location when we first get a GPS lock.
  useEffect(() => {
    if (!userLocation) return;
    if (lastFetchCenter.current === null) {
      map.setView([userLocation.lat, userLocation.lng], DEFAULT_ZOOM, { animate: true });
    }
  }, [userLocation, map]);

  // Refetch hazards whenever the map settles after a move.
  useMapEvents({
    moveend: async () => {
      await refresh();
    },
  });

  const refresh = async () => {
    const c = map.getCenter();
    const center = { lat: c.lat, lng: c.lng };
    const radius = getViewRadiusMeters(map);
    lastFetchCenter.current = center;

    try {
      const [{ hazards }, { points }] = await Promise.all([
        fetchHazards({ lat: center.lat, lng: center.lng, radius: Math.ceil(radius) }),
        fetchHeatmap({ lat: center.lat, lng: center.lng, radius: Math.ceil(radius) }),
      ]);

      // Update heatmap
      if (!heatLayerRef.current) {
        heatLayerRef.current = L.heatLayer([], {
          radius: 28,
          blur: 22,
          maxZoom: 17,
          max: 1.0,
          gradient: { 0.3: '#fde047', 0.65: '#fb923c', 1.0: '#ef4444' },
        }).addTo(map);
      }
      heatLayerRef.current.setLatLngs(points.map(([lat, lng, i]) => [lat, lng, i]));

      // Update markers
      markerLayerRef.current.clearLayers();
      for (const h of hazards) {
        const cat = CATEGORY_MAP[h.category] ?? { label: h.category, emoji: '⚠️' };
        const m = L.marker([h.lat, h.lng], { icon: hazardIcon(h.category) });
        m.bindPopup(`<strong>${cat.emoji} ${cat.label}</strong>`);
        m.on('click', () => onSelectHazard?.(h));
        m.addTo(markerLayerRef.current);
      }

      onHazardsLoaded?.(hazards);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[map] failed to fetch hazards:', err.message);
    }
  };

  // Expose methods to the parent via ref
  useImperativeHandle(
    ref,
    () => ({
      refresh,
      panToUser: () => {
        if (userLocation) map.flyTo([userLocation.lat, userLocation.lng], DEFAULT_ZOOM);
      },
    }),
    [userLocation]
  );

  // Kick off an initial fetch on mount
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
});

function getViewRadiusMeters(map) {
  // Approx: half the diagonal of the current view in meters.
  const bounds = map.getBounds();
  const center = map.getCenter();
  const ne = bounds.getNorthEast();
  // crude: use distance from center to NE corner
  return center.distanceTo(ne);
}

/**
 * Main exported map component.
 * Props:
 *   - userLocation: {lat,lng}
 *   - onHazardsLoaded(hazards): called after each successful refresh
 *   - onSelectHazard(hazard): called when a marker is tapped
 *   - apiRef: ref exposing { refresh, panToUser }
 */
const SafetyMap = forwardRef(function SafetyMap({ userLocation, onHazardsLoaded, onSelectHazard }, ref) {
  const center = useMemo(() => userLocation ?? DEFAULT_CENTER, []);
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      className="map-wrap"
      maxZoom={19}
      minZoom={11}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />
      {userLocation && (
        <>
          {/* accuracy circle */}
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={12}
            pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.15, weight: 0 }}
          />
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon()} interactive={false} />
        </>
      )}
      <MapController
        ref={ref}
        userLocation={userLocation}
        onHazardsLoaded={onHazardsLoaded}
        onSelectHazard={onSelectHazard}
      />
    </MapContainer>
  );
});

export default SafetyMap;
