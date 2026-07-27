/**
 * components/ReportModal.jsx
 * --------------------------
 * Bottom action sheet for one-tap reporting.
 * Step 1: choose a category (5 chips).
 * Step 2: optional description + confirmation.
 * On confirm: POST /api/reports with pin = device GPS and deviceLocation = device GPS
 * (the pin defaults to user's current location; we pre-fill so the call is instant).
 */
import { useState } from 'react';
import { CATEGORIES } from '../utils/constants';
import { createReport } from '../services/api';
import { useToast } from './Toast';

export default function ReportModal({ open, onClose, userLocation, onSubmitted }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function close() {
    setStep(1);
    setCategory(null);
    setDescription('');
    setSubmitting(false);
    onClose?.();
  }

  async function submit() {
    if (!category) return;
    if (!userLocation) {
      toast.error('Waiting for your GPS location — try again in a moment.');
      return;
    }
    setSubmitting(true);
    try {
      // Per spec: pin = user's live GPS; deviceLocation = user's live GPS.
      // (Map pin-drag can be added later; default behavior is one-tap instant.)
      const payload = {
        category: category.code,
        description: description.trim() || undefined,
        pin: userLocation,
        deviceLocation: userLocation,
      };
      const res = await createReport(payload);
      toast.success(`${category.label} reported. Thanks for looking out.`);
      onSubmitted?.(res.report);
      close();
    } catch (err) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="handle" />
        <h2>{step === 1 ? 'What’s happening?' : `Report: ${category?.label}`}</h2>
        <p className="sub">
          {step === 1
            ? 'Tap the category that matches what you see. Reports are anonymous and expire automatically.'
            : 'Add a short note if helpful — personal details are stripped automatically.'}
        </p>

        {step === 1 && (
          <div className="cat-grid">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.code}
                className={`cat-btn ${cat.code}`}
                onClick={() => {
                  setCategory(cat);
                  setStep(2);
                }}
              >
                <span className="emoji">{cat.emoji}</span>
                <span className="lbl">{cat.label}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            <textarea
              className="desc-input"
              placeholder="Optional: short description (e.g. 'group of men loitering, blocking sidewalk')"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              maxLength={500}
              autoFocus
            />
            <div className="row mt-16">
              <button className="btn ghost" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </button>
              <button className="btn primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Send report'}
              </button>
            </div>
            <div className="row mt-12">
              <button className="btn ghost" onClick={close} disabled={submitting} style={{ flex: 0, padding: '10px 14px' }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
