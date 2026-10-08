import { useEffect, useState } from 'react';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelNoticeKind = 'warning' | 'reminder';

type Props = {
  alerts: WaterLevelSensor[];
  kind?: WaterLevelNoticeKind;
  onClose: () => void;
  onSeeDetails?: () => void;
};

export default function WaterLevelAlert({ alerts, kind = 'warning', onClose, onSeeDetails }: Props) {
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

  if (alerts.length === 0) return null;

  const highest = alerts.reduce((current, sensor) => (
    sensor.waterLevelPercentage > current.waterLevelPercentage ? sensor : current
  ));
  const sensorSummary = alerts.length === 1 ? '1 hardware sensor has' : `${alerts.length} hardware sensors have`;

  return (
    <section
      className={`hardware-water-notice ${reminder ? 'hardware-water-notice-reminder' : 'hardware-water-notice-warning'}`}
      role="alert"
      aria-live="assertive"
      aria-labelledby="water-level-alert-title"
      style={{ position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 12000, width: 'min(34rem, calc(100vw - 2rem))', overflow: 'hidden', borderRadius: '1rem', border: `1px solid ${reminder ? '#fcd34d' : '#fca5a5'}`, background: '#fff', boxShadow: '0 20px 52px rgba(15,23,42,.32)', opacity: isVanishing ? 0 : 1, transform: isVanishing ? 'translate3d(24px,-8px,0) scale(.98)' : 'translate3d(0,0,0) scale(1)', transition: 'opacity .8s ease, transform .8s ease', pointerEvents: 'auto' }}
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <h2 id="water-level-alert-title">{reminder ? 'Post updates reminder' : 'Hardware water-level warning'}</h2>
        <p>
          {reminder
            ? 'Calamba is currently rainy and elevated water levels were detected. Post a notification to inform residents of affected barangays.'
            : `${sensorSummary} reached a moderate or high water level. The highest reading is ${highest.waterLevelPercentage.toFixed(0)}% in Barangay ${highest.barangayName}.`}
        </p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
      <button className="hardware-water-notice-close" type="button" onClick={onClose} aria-label="Close water-level notification">×</button>
    </section>
  );
}
