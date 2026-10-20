import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelNoticeKind = 'warning' | 'reminder';

type Props = {
  alert: WaterLevelSensor;
  kind: WaterLevelNoticeKind;
  onClose: () => void;
  onSeeDetails?: () => void;
};

export default function WaterLevelAlert({ alert, kind, onClose, onSeeDetails }: Props) {
  const [isVanishing] = useState(false);
  const reminder = kind === 'reminder';

  return createPortal(
    <section
      className={`hardware-water-notice barangay-water-level-alert ${reminder ? 'hardware-water-notice-reminder' : 'hardware-water-notice-warning'} ${isVanishing ? 'hardware-water-notice-vanishing' : ''}`}
      role="alert"
      aria-live="assertive"
      aria-labelledby="barangay-water-level-alert-title"
    >
      <div className="hardware-water-summary-icon" aria-hidden="true">!</div>
      <div className="hardware-water-summary-copy">
        <p className="hardware-water-eyebrow">{reminder ? 'Action required' : 'Urgent water-level alert'}</p>
        <h2 id="barangay-water-level-alert-title">Hardware water-level warning</h2>
        <p className="hardware-water-message">The sensor in Barangay {alert.barangayName} reached a moderate or high water level at {alert.waterLevelPercentage.toFixed(0)}%.</p>
        {onSeeDetails ? <button className="hardware-water-see-details" type="button" onClick={onSeeDetails}>See details</button> : null}
      </div>
      <button className="hardware-water-notice-close" type="button" onClick={onClose} aria-label="Close water-level notification">×</button>
    </section>,
    document.body,
  );
}
