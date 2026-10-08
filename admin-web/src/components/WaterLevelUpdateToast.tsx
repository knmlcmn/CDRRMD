import { useEffect, useState } from 'react';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelUpdateNoticeKind = 'update' | 'post-updates';

type Props = {
  sensors: WaterLevelSensor[];
  kind: WaterLevelUpdateNoticeKind;
  onDone: () => void;
  onSeeDetails?: () => void;
};

export default function WaterLevelUpdateToast({ sensors, kind, onDone, onSeeDetails }: Props) {
  const [isFading, setIsFading] = useState(false);
  const postUpdates = kind === 'post-updates';

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setIsFading(true), 7_200);
    const doneTimer = window.setTimeout(onDone, 8_000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  if (sensors.length === 0) return null;

  const highest = sensors.reduce((current, sensor) => (
    sensor.waterLevelPercentage > current.waterLevelPercentage ? sensor : current
  ));
  const sensorSummary = sensors.length === 1 ? '1 hardware sensor has' : `${sensors.length} hardware sensors have`;

  return (
    <section
      className={`hardware-water-notice hardware-water-update-notice ${postUpdates ? 'hardware-water-notice-reminder' : 'hardware-water-notice-update'}`}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '1.25rem',
        right: '1.25rem',
        zIndex: 12000,
        width: 'min(30rem, calc(100vw - 2rem))',
        overflow: 'hidden',
        border: `1px solid ${postUpdates ? '#fcd34d' : '#7dd3fc'}`,
        borderRadius: '1rem',
        background: '#fff',
        boxShadow: '0 20px 52px rgba(15,23,42,.3)',
        opacity: isFading ? 0 : 1,
        transform: isFading ? 'translate3d(22px,-6px,0) scale(.98)' : 'translate3d(0,0,0) scale(1)',
        transition: 'opacity 1s ease, transform 1s ease',
        pointerEvents: 'auto',
      }}
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <h2>{postUpdates ? 'Post updates reminder' : 'Hardware water-level warning'}</h2>
        <p>
          {postUpdates
            ? 'Calamba is currently rainy and elevated water levels were detected. Post a notification to inform residents of affected barangays.'
            : `${sensorSummary} reached a moderate or high water level. The highest reading is ${highest.waterLevelPercentage.toFixed(0)}% in Barangay ${highest.barangayName}.`}
        </p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
    </section>
  );
}
