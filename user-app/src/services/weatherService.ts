import { api } from './api';

const CITY_LATITUDE = 14.2117;
const CITY_LONGITUDE = 121.1653;

const FALLBACK_CURRENT =
  `https://api.open-meteo.com/v1/forecast?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}&current=temperature_2m,weather_code&timezone=auto`;

const FALLBACK_FORECAST =
  `https://api.open-meteo.com/v1/forecast?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}` +
  '&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m,apparent_temperature' +
  '&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max' +
  '&forecast_days=14&timezone=auto';

async function fetchFallback(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenMeteo ${response.status}`);
  }
  return response.json();
}

export async function getCityCurrentWeather() {
  try {
    const response = await api.get(`/weather?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}`);
    return response.data ?? null;
  } catch {
    // If backend is unreachable, fallback keeps weather UI functional.
    return fetchFallback(FALLBACK_CURRENT);
  }
}

export async function getCityForecastWeather() {
  try {
    const response = await api.get(`/weather?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}&forecast_days=14`);
    return response.data ?? null;
  } catch {
    // Preserve 14-day forecast UX even during API outages.
    return fetchFallback(FALLBACK_FORECAST);
  }
}
