/**
 * App.jsx
 * -------
 * Top-level shell for Safety Radar:
 *   1. Listens to Supabase auth state → shows SignIn screen or app shell.
 *   2. Provides continuous GPS via useGeolocation.
 *   3. Renders the Leaflet safety map, top bar, floating quick-report button,
 *      and handles opening/closing of the report & hazard-detail sheets.
 */
import { useEffect, useRef, useState } from 'react';
import SafetyMap from './components/Map/SafetyMap';
import ReportModal from './components/ReportModal';
import HazardDetailModal from './components/HazardDetailModal';
import SignIn from './components/SignIn';
import { ToastProvider, useToast } from './components/Toast';
import { onAuthStateChange, signOut, supabase } from './services/auth';
import { useGeolocation } from './hooks/useGeolocation';

function StatusChip({ geo }) {
  if (geo.status === 'tracking' && geo.accuracy) {
    const band = geo.accuracy.band;
    const dotCls = band === 'high' ? '' : band === 'medium' ? 'warn' : 'err';
    const label = band === 'high' ? 'GPS locked' : band === 'medium' ? 'GPS approx.' : 'Low accuracy';
    return <span className="chip"><span className={`dot ${dotCls}`} />{label}</span>;
  }
  if (geo.status === 'requesting') return <span className="chip"><span className="dot idle" />Locating…</span>;
  if (geo.status === 'fallback') return <span className="chip"><span className="dot warn" />Approx. location</span>;
  return <span className="chip"><span className="dot idle" />Locating…</span>;
}

function AppShell() {
  const toast = useToast();
  const geo = useGeolocation();
  const mapApiRef = useRef(null);
  const [session, setSession] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [_, setHazards] = useState([]); // retained for future features (count, etc.)

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const sub = onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.data.subscription.unsubscribe();
  }, []);

  function handleSubmitted() {
    // Re-center the map on the user and refresh hazards after reporting.
    mapApiRef.current?.refresh?.();
  }

  function handleHazardChanged() {
    mapApiRef.current?.refresh?.();
  }

  async function handleSignOut() {
    await signOut();
    toast.show('Signed out');
  }

  if (!session) return <SignIn />;

  return (
    <div className="app">
      <SafetyMap
        ref={mapApiRef}
        userLocation={geo.coords}
        onHazardsLoaded={setHazards}
        onSelectHazard={(h) => setSelected(h)}
      />

      <div className="top-bar">
        <div className="left">
          <StatusChip geo={geo} />
        </div>
        <div className="right">
          <button
            className="icon-btn"
            onClick={() => mapApiRef.current?.panToUser?.()}
            aria-label="Center on my location"
            title="My location"
          >
            📍
          </button>
          <button className="icon-btn" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
            ⏻
          </button>
        </div>
      </div>

      <div className="side-controls">
        <button
          className="icon-btn"
          onClick={() => mapApiRef.current?.refresh?.()}
          aria-label="Refresh hazards"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      <div className="fab">
        <button
          onClick={() => setReportOpen(true)}
          aria-label="Report hazard"
          disabled={geo.status !== 'tracking' && geo.status !== 'fallback'}
        >
          🛡️
        </button>
        <span className="label">Report</span>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        userLocation={geo.coords}
        onSubmitted={handleSubmitted}
      />

      {selected && (
        <HazardDetailModal
          hazard={selected}
          userLocation={geo.coords}
          onClose={() => setSelected(null)}
          onChanged={handleHazardChanged}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
