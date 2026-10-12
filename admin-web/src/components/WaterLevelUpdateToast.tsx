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
    const fadeTimer = window.setTimeout(() => setIsFading(true), 14_200);
    const doneTimer = window.setTimeout(onDone, 15_000);
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
      className={`hardware-water-notice hardware-water-update-notice ${postUpdates ? 'hardware-water-notice-reminder' : 'hardware-water-notice-update'} ${isFading ? 'hardware-water-notice-vanishing' : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <p className="hardware-water-eyebrow">{postUpdates ? 'Action required' : 'Urgent water-level alert'}</p>
        <h2>{postUpdates ? 'Post updates reminder' : 'Hardware water-level warning'}</h2>
        <p className="hardware-water-message">
          {postUpdates
            ? 'Calamba is currently rainy and elevated water levels were detected. Post a notification to inform residents of affected barangays.'
            : `${sensorSummary} reached a moderate or high water level. The highest reading is ${highest.waterLevelPercentage.toFixed(0)}% in Barangay ${highest.barangayName}.`}
        </p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
      <button className="hardware-water-notice-close" type="button" onClick={onDone} aria-label="Close water-level notification">×</button>
    </section>
  );
}
