import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelNoticeKind = 'warning' | 'reminder';

type Props = {
  alerts: WaterLevelSensor[];
  kind?: WaterLevelNoticeKind;
  onClose: () => void;
  onSeeDetails?: () => void;
};

export default function WaterLevelAlert({ alerts, kind = 'warning', onClose, onSeeDetails }: Props) {
  const [isVanishing] = useState(false);
  const reminder = kind === 'reminder';

  if (alerts.length === 0) return null;

  const highest = alerts.reduce((current, sensor) => (
    sensor.waterLevelPercentage > current.waterLevelPercentage ? sensor : current
  ));
  const sensorSummary = alerts.length === 1 ? '1 hardware sensor has' : `${alerts.length} hardware sensors have`;

  return createPortal(
    <section
      className={`hardware-water-notice ${reminder ? 'hardware-water-notice-reminder' : 'hardware-water-notice-warning'} ${isVanishing ? 'hardware-water-notice-vanishing' : ''}`}
      role="alert"
      aria-live="assertive"
      aria-labelledby="water-level-alert-title"
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <p className="hardware-water-eyebrow">{reminder ? 'Action required' : 'Urgent water-level alert'}</p>
        <h2 id="water-level-alert-title">{reminder ? 'Post updates reminder' : 'Hardware water-level warning'}</h2>
        <p className="hardware-water-message">
          {reminder
            ? 'Calamba is currently rainy and elevated water levels were detected. Post a notification to inform residents of affected barangays.'
            : `${sensorSummary} reached a moderate or high water level. The highest reading is ${highest.waterLevelPercentage.toFixed(0)}% in Barangay ${highest.barangayName}.`}
        </p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
      <button className="hardware-water-notice-close" type="button" onClick={onClose} aria-label="Close water-level notification">×</button>
    </section>,
    document.body,
  );
}
