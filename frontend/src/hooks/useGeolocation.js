/**
 * hooks/useGeolocation.js
 * -----------------------
 * Continuous GPS tracking hook. Returns { coords, accuracy, status, error,
 * requestPermission, centerToUser }.
 *
 * Statuses:
 *   'idle'       – no attempt yet
 *   'requesting' – awaiting user permission
 *   'tracking'   – watchPosition active, coords are live
 *   'error'      – permission denied / unavailable
 *   'fallback'   – couldn't get live GPS (e.g. desktop dev), using fallback coords
 *
 * Accuracy is a simple traffic-light derived from the geolocation API's
 * accuracy estimate (in meters): 'high' <30m, 'medium' 30-100m, 'low' >100m.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CENTER } from '../utils/constants';

const HIGH_ACC_M = 30;
const MED_ACC_M = 100;

export function useGeolocation({ fallback = DEFAULT_CENTER, autoStart = true } = {}) {
  const [state, setState] = useState({
    coords: fallback,
    accuracy: null,
    status: 'idle',
    error: null,
  });
  const watchIdRef = useRef(null);

  const stop = useCallback(() => {
    if (watchIdRef.current != null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'fallback', error: 'Geolocation not supported', coords: fallback }));
      return;
    }
    setState((s) => ({ ...s, status: 'requesting', error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        const accuracyBand = acc <= HIGH_ACC_M ? 'high' : acc <= MED_ACC_M ? 'medium' : 'low';
        setState({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: { meters: Math.round(acc), band: accuracyBand },
          status: 'tracking',
          error: null,
        });
      },
      (err) => {
        // On first error (e.g. denied), fall back to default so the map still shows.
        setState((s) => ({
          ...s,
          status: 'fallback',
          error: err.message || 'Location unavailable',
          coords: s.coords.lat === fallback.lat && s.coords.lng === fallback.lng ? fallback : s.coords,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );
  }, [fallback]);

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
  }, [autoStart, start, stop]);

  const requestPermission = start;

  return { ...state, requestPermission, stop, start };
}
