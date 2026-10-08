import { useEffect, useState } from 'react';
import type { WaterLevelSensor } from '../services/waterLevelSensors';

export type WaterLevelUpdateNoticeKind = 'update' | 'post-updates';

type Props = {
  sensors: WaterLevelSensor[];
  kind: WaterLevelUpdateNoticeKind;
  onDone: () => void;
};

export default function WaterLevelUpdateToast({ sensors, kind, onDone }: Props) {
  const [isFading, setIsFading] = useState(false);
  const postUpdates = kind === 'post-updates';

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setIsFading(true), 2_000);
    const doneTimer = window.setTimeout(onDone, 3_000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <section
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
        pointerEvents: 'none',
      }}
    >
      <div style={{ padding: '.85rem 1rem', color: '#fff', background: postUpdates ? 'linear-gradient(135deg,#b45309,#f59e0b)' : 'linear-gradient(135deg,#0369a1,#0ea5e9)' }}>
        <p style={{ margin: 0, fontSize: '.72rem', fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .9 }}>
          {postUpdates ? 'Resident monitoring reminder' : 'Water indicator update'}
        </p>
        <h2 style={{ margin: '.2rem 0 0', fontSize: '1.05rem', fontWeight: 900, lineHeight: 1.25 }}>
          {postUpdates ? 'Post updates to monitor residents of the affected barangay' : 'Water level increased by another 10%'}
        </h2>
      </div>
      <div style={{ display: 'grid', gap: '.4rem', padding: '.75rem 1rem' }}>
        {sensors.map((sensor) => (
          <div key={sensor.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#334155', fontSize: '.82rem' }}>
            <strong>Barangay {sensor.barangayName}</strong>
            <strong style={{ color: sensor.waterLevelPercentage >= 75 ? '#b91c1c' : '#d97706' }}>{sensor.waterLevelPercentage.toFixed(0)}%</strong>
          </div>
        ))}
        <p style={{ margin: '.15rem 0 0', color: '#64748b', fontSize: '.75rem' }}>
          {postUpdates ? 'Share current safety information and continue monitoring residents.' : 'Notifications begin at 40% and repeat for each additional 10% increase.'}
        </p>
      </div>
    </section>
  );
}
