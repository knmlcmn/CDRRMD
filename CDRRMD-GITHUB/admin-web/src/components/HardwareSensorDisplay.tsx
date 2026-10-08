import { HIGH_WATER_LEVEL_THRESHOLD as HIGH_WATER_THRESHOLD, MODERATE_WATER_LEVEL_THRESHOLD as FLOOD_REPORT_THRESHOLD } from '../services/waterLevelHazard';

export type SensorMetric = 'water' | 'temperature' | 'humidity';

export const SENSOR_METRIC_LABELS: Record<SensorMetric, string> = {
  water: 'Water Gauge',
  temperature: 'Temperature',
  humidity: 'Humidity',
};

type SensorCardClasses = {
  card: string;
  name: string;
  gauge: string;
};

type HardwareSensorDisplayProps = {
  name: string;
  status: 'Active' | 'Unavailable';
  waterLevelPercentage: number;
  temperatureCelsius?: number | null;
  humidityPercentage?: number | null;
  metric: SensorMetric | 'all';
  classes: SensorCardClasses;
};

type SensorMetricSelectorProps = {
  value: SensorMetric;
  onChange: (metric: SensorMetric) => void;
};

function readingStyle(metric: Exclude<SensorMetric, 'water'>, value?: number | null) {
  if (typeof value !== 'number') {
    return { icon: '\u2014', label: 'No reading', className: 'climate-badge-unavailable' };
  }

  if (metric === 'temperature') {
    if (value < 25) return { icon: '\u2744\uFE0F', label: 'Cold', className: 'climate-badge-cold' };
    if (value < 32) return { icon: '\u2600\uFE0F', label: 'Warm', className: 'climate-badge-warm' };
    return { icon: '\uD83D\uDD25', label: 'Hot', className: 'climate-badge-hot' };
  }

  if (value < 40) return { icon: '\uD83D\uDCA7', label: 'Low', className: 'climate-badge-humidity-low' };
  if (value < 70) return { icon: '\uD83D\uDCA6', label: 'Moderate', className: 'climate-badge-humidity-moderate' };
  return { icon: '\uD83C\uDF0A', label: 'High', className: 'climate-badge-humidity-high' };
}

function ClimateReading({
  metric,
  value,
  compact = false,
}: {
  metric: Exclude<SensorMetric, 'water'>;
  value?: number | null;
  compact?: boolean;
}) {
  const reading = readingStyle(metric, value);
  const formattedValue = typeof value !== 'number'
    ? metric === 'temperature' ? '--\u00B0C' : '--%'
    : metric === 'temperature' ? `${value.toFixed(1)}\u00B0C` : `${value.toFixed(0)}%`;

  return (
    <div className={[
      'flex min-w-0 flex-col items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-center shadow-inner',
      compact ? 'h-36 w-full gap-2 px-4 py-4 sm:h-44 xl:h-[220px]' : 'h-36 w-full max-w-[180px] gap-2 px-3 py-4 sm:h-44 xl:h-[220px]',
    ].join(' ')}>
      <span className={['text-3xl leading-none', reading.className].join(' ')} aria-hidden="true">{reading.icon}</span>
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-300">{SENSOR_METRIC_LABELS[metric]}</span>
      <strong className={['text-2xl font-black leading-none sm:text-3xl', reading.className].join(' ')}>{formattedValue}</strong>
      <span className="text-xs font-bold text-slate-300">{reading.label}</span>
    </div>
  );
}

function WaterGauge({
  status,
  percentage,
  gaugeClassName,
}: {
  status: 'Active' | 'Unavailable';
  percentage: number;
  gaugeClassName: string;
}) {
  const normalizedPercentage = Math.max(0, Math.min(100, percentage));

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div
        className={[
          gaugeClassName,
          status === 'Unavailable'
            ? 'water-gauge-unavailable'
            : percentage >= HIGH_WATER_THRESHOLD
              ? 'water-gauge-high'
              : percentage >= FLOOD_REPORT_THRESHOLD
                ? 'water-gauge-moderate'
                : 'water-gauge-low',
        ].join(' ')}
        style={{
          background: status === 'Unavailable'
            ? 'linear-gradient(180deg, #d1d5db 0%, #94a3b8 100%)'
            : 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
        }}
      >
        {status === 'Unavailable' ? (
          <span className="sensor-unavailable-mark" aria-label="Sensor unavailable">/</span>
        ) : (
          <div
            className="water-gauge-fill"
            style={{
              width: '100%',
              height: `${normalizedPercentage}%`,
              borderRadius: '0.75rem',
              background: percentage >= HIGH_WATER_THRESHOLD
                ? 'linear-gradient(180deg, #ef4444 0%, #b91c1c 100%)'
                : percentage >= FLOOD_REPORT_THRESHOLD
                  ? 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
                  : 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
            }}
          >
            <span className="water-gauge-surface" aria-hidden="true" />
          </div>
        )}
      </div>
      <strong className="sensor-water-percentage">
        {status === 'Unavailable' ? 'Unavailable' : `${percentage.toFixed(0)}%`}
      </strong>
    </div>
  );
}

export function SensorMetricSelector({ value, onChange }: SensorMetricSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Sensor reading to display">
      {(Object.keys(SENSOR_METRIC_LABELS) as SensorMetric[]).map((metric) => (
        <button
          key={metric}
          type="button"
          onClick={() => onChange(metric)}
          aria-pressed={value === metric}
          className={[
            'rounded-lg border px-3 py-2 text-sm font-extrabold transition',
            value === metric
              ? 'border-sky-500 bg-sky-600 text-white shadow-sm'
              : 'border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50',
          ].join(' ')}
        >
          {SENSOR_METRIC_LABELS[metric]}
        </button>
      ))}
    </div>
  );
}

export default function HardwareSensorDisplay({
  name,
  status,
  waterLevelPercentage,
  temperatureCelsius,
  humidityPercentage,
  metric,
  classes,
}: HardwareSensorDisplayProps) {
  return (
    <article className={classes.card}>
      <p className={classes.name}>{name}</p>
      {metric === 'all' ? (
        <div className="grid w-full max-w-4xl grid-cols-1 items-start gap-4 sm:grid-cols-3">
          <div className="flex min-w-0 justify-center">
            <WaterGauge status={status} percentage={waterLevelPercentage} gaugeClassName={classes.gauge} />
          </div>
          <ClimateReading metric="temperature" value={status === 'Unavailable' ? null : temperatureCelsius} compact />
          <ClimateReading metric="humidity" value={status === 'Unavailable' ? null : humidityPercentage} compact />
        </div>
      ) : metric === 'water' ? (
        <WaterGauge status={status} percentage={waterLevelPercentage} gaugeClassName={classes.gauge} />
      ) : (
        <ClimateReading
          metric={metric}
          value={status === 'Unavailable' ? null : metric === 'temperature' ? temperatureCelsius : humidityPercentage}
        />
      )}
    </article>
  );
}
