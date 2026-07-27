/**
 * components/HazardDetailModal.jsx
 * --------------------------------
 * Shows a single hazard's details with upvote / "Area Clear" buttons.
 * Called when a hazard marker is tapped on the map.
 */
import { useState } from 'react';
import { CATEGORY_MAP, FRESH_THRESHOLD_MS } from '../utils/constants';
import { formatDistance, relativeTime } from '../utils/format';
import { clearReport, voteReport } from '../services/api';
import { useToast } from './Toast';

export default function HazardDetailModal({ hazard, userLocation, onClose, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(hazard);
  if (!local) return null;

  const cat = CATEGORY_MAP[local.category] ?? { label: local.category, emoji: '⚠️', color: '#ef4444' };
  const ageMs = Date.now() - new Date(local.created_at).getTime();
  const fresh = ageMs < FRESH_THRESHOLD_MS;
  const distance = userLocation
    ? haversine(userLocation, { lat: local.lat, lng: local.lng })
    : local.distance_meters;

  async function vote(type) {
    setBusy(true);
    try {
      const res = await voteReport(local.id, type);
      setLocal((prev) => ({ ...prev, ...res.report }));
      onChanged?.(res.report);
      toast.success(type === 'up' ? 'Thanks for confirming.' : 'Downvote recorded.');
    } catch (err) {
      toast.error(err.message || 'Vote failed');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const res = await clearReport(local.id);
      setLocal((prev) => ({ ...prev, ...res.report }));
      onChanged?.(res.report);
      if (res.cleared) toast.success('Area marked as clear.');
      else toast.success('Area-clear vote recorded.');
    } catch (err) {
      toast.error(err.message || 'Clear failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="handle" />
        <div className="hazard-head">
          <div className="hazard-icon" style={{ background: cat.bg }}>{cat.emoji}</div>
          <div style={{ flex: 1 }}>
            <h3 className="hazard-title">{cat.label}</h3>
            <div className="hazard-meta">
              <span style={{ color: fresh ? '#22c55e' : '#eab308' }}>{fresh ? '● ' : '○ '}</span>
              {relativeTime(local.created_at)} · {formatDistance(distance)} away
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {local.description ? <div className="hazard-desc">{local.description}</div> : null}

        <div className="vote-row">
          <button className="btn ghost" onClick={() => vote('up')} disabled={busy}>
            👍 Still there <span style={{ opacity: .7 }}>({local.upvotes ?? 0})</span>
          </button>
          <button className="btn success" onClick={clear} disabled={busy}>
            ✓ Area Clear <span style={{ opacity: .7 }}>({local.downvotes ?? 0})</span>
          </button>
        </div>
        <div className="vote-count">
          Upvotes confirm a hazard; 3 independent "Area Clear" votes remove it from the map.
        </div>

        <button
          className="btn danger mt-16"
          onClick={onClose}
          disabled={busy}
          style={{ width: '100%' }}
        >
          Close
        </button>
      </div>
    </>
  );
}

/* --- Inline haversine (for client-side distance to marker when available) --- */
function haversine(a, b) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
