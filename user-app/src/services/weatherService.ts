import { api } from './api';
import { createWeatherSnapshotStore } from '../utils/weatherSnapshotStore';

const CITY_LATITUDE = 14.2117;
const CITY_LONGITUDE = 121.1653;
const CITY_FORECAST_URL = `/weather?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}&forecast_days=7`;
export const WEATHER_SNAPSHOT_FRESHNESS_TTL_MS = 30_000;

export type CityWeatherSnapshot = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    weather_code?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    wind_speed_10m_max?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
  };
};

const cityWeatherStore = createWeatherSnapshotStore<CityWeatherSnapshot>(async () => {
  const response = await api.get(CITY_FORECAST_URL);
  return response.data ?? {};
}, {
  freshnessTtlMs: WEATHER_SNAPSHOT_FRESHNESS_TTL_MS,
  sourceTime(value) {
    const parsed = Date.parse(String(value.current?.time || ''));
    return Number.isFinite(parsed) ? parsed : null;
  },
});

export function getCityWeatherSnapshot() {
  return cityWeatherStore.read();
}

export function getCityForecastWeather(options: { forceRefresh?: boolean } = {}) {
  return cityWeatherStore.load(options);
}
