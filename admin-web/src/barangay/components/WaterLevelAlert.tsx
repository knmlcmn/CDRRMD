import { useEffect, useState } from 'react';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelNoticeKind = 'warning' | 'reminder';

type Props = {
  alert: WaterLevelSensor;
  kind: WaterLevelNoticeKind;
  onClose: () => void;
  onSeeDetails?: () => void;
};

export default function WaterLevelAlert({ alert, kind, onClose, onSeeDetails }: Props) {
  const [isVanishing, setIsVanishing] = useState(false);
  const reminder = kind === 'reminder';

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
      className={`hardware-water-notice barangay-water-level-alert ${reminder ? 'hardware-water-notice-reminder' : 'hardware-water-notice-warning'}`}
      role="alert"
      aria-live="assertive"
      aria-labelledby="barangay-water-level-alert-title"
      style={{ position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 12000, width: 'min(34rem, calc(100vw - 2rem))', overflow: 'hidden', borderRadius: '1rem', background: '#fff', boxShadow: '0 20px 52px rgba(15,23,42,.32)', opacity: isVanishing ? 0 : 1, transform: isVanishing ? 'translate3d(24px,-8px,0) scale(.98)' : 'translate3d(0,0,0) scale(1)', transition: 'opacity .8s ease, transform .8s ease', pointerEvents: 'auto' }}
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <h2 id="barangay-water-level-alert-title">Hardware water-level warning</h2>
        <p>The sensor in Barangay {alert.barangayName} reached a moderate or high water level at {alert.waterLevelPercentage.toFixed(0)}%.</p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
      <button className="hardware-water-notice-close" type="button" onClick={onClose} aria-label="Close water-level notification">×</button>
    </section>
  );
}
