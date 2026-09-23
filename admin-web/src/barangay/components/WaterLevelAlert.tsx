import { useEffect, useState } from 'react';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelNoticeKind = 'warning' | 'reminder';

type Props = {
  alert: WaterLevelSensor;
  kind: WaterLevelNoticeKind;
  onClose: () => void;
};

export default function WaterLevelAlert({ alert, kind, onClose }: Props) {
  const [isVanishing, setIsVanishing] = useState(false);
  const reminder = kind === 'reminder';
  const accentBorder = reminder ? '#fcd34d' : '#fca5a5';
  const headerBackground = reminder
    ? 'linear-gradient(135deg,#b45309,#f59e0b)'
    : 'linear-gradient(135deg,#b91c1c,#ef4444)';

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setIsVanishing(true), 7_200);
    const closeTimer = window.setTimeout(onClose, 8_000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [onClose]);

  return (
    <section
      className="barangay-water-level-alert"
      role="alert"
      aria-live="assertive"
      aria-labelledby="barangay-water-level-alert-title"
      style={{ position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 12000, width: 'min(34rem, calc(100vw - 2rem))', overflow: 'hidden', borderRadius: '1rem', border: `1px solid ${accentBorder}`, background: '#fff', boxShadow: '0 20px 52px rgba(15,23,42,.32)', opacity: isVanishing ? 0 : 1, transform: isVanishing ? 'translate3d(24px,-8px,0) scale(.98)' : 'translate3d(0,0,0) scale(1)', transition: 'opacity .8s ease, transform .8s ease', pointerEvents: 'auto' }}
    >
        <div className="barangay-water-level-alert-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.85rem 1rem', color: '#fff', background: headerBackground }}>
          <div>
            <p style={{ margin: 0, fontSize: '.75rem', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .9 }}>
              {reminder ? 'Community update reminder' : 'Flood monitoring warning'}
            </p>
            <h2 id="barangay-water-level-alert-title" style={{ margin: '.2rem 0 0', fontSize: '1.2rem', fontWeight: 900 }}>
              {reminder ? 'Water level remains at 40% or higher' : 'Water level reached 40% or higher'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close water-level notification" style={{ alignSelf: 'start', border: '1px solid rgba(255,255,255,.55)', borderRadius: '.55rem', background: 'rgba(255,255,255,.14)', color: '#fff', cursor: 'pointer', padding: '.3rem .55rem', fontWeight: 900 }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: '.55rem', padding: '.85rem 1rem' }}>
          <article className="barangay-water-level-alert-reading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', border: `1px solid ${reminder ? '#fde68a' : '#fecaca'}`, borderRadius: '.75rem', background: reminder ? '#fffbeb' : '#fff7f7', padding: '.75rem .85rem' }}>
            <div>
              <strong style={{ color: reminder ? '#78350f' : '#7f1d1d' }}>Barangay {alert.barangayName}</strong>
              <p style={{ margin: '.15rem 0 0', color: '#64748b', fontSize: '.82rem' }}>
                {reminder
                  ? 'Please publish a safety update for residents and continue monitoring conditions.'
                  : 'Please monitor the sensor and prepare the local response team.'}
              </p>
            </div>
            <strong style={{ flex: '0 0 auto', color: alert.waterLevelPercentage >= 75 ? '#b91c1c' : '#d97706', fontSize: '1.35rem' }}>{alert.waterLevelPercentage.toFixed(0)}%</strong>
          </article>
          <p style={{ margin: '.15rem 0 0', color: '#475569', fontSize: '.78rem' }}>
            {reminder
              ? 'Publish a timely advisory while the elevated water reading is active.'
              : 'This notification closes automatically after 8 seconds.'}
          </p>
        </div>
    </section>
  );
}
