const { httpError } = require('../utils/httpError');
const { loadHardwareSensorSnapshot, nearestHardwareClimate } = require('./hardwareSensorService');

const FORECAST_CACHE_TTL_MS = 12 * 60 * 1000;
const FORECAST_CACHE_MAX_ENTRIES = 50;
const forecastCache = new Map();
const forecastRequests = new Map();

function forecastKey(latitude, longitude, forecastDays) {
  return `${latitude.toFixed(3)}:${longitude.toFixed(3)}:${forecastDays}`;
}

function pruneForecastCache(now) {
  for (const [key, entry] of forecastCache) {
    if (now - entry.cachedAt >= FORECAST_CACHE_TTL_MS) forecastCache.delete(key);
  }
  while (forecastCache.size > FORECAST_CACHE_MAX_ENTRIES) {
    forecastCache.delete(forecastCache.keys().next().value);
  }
}

async function loadOpenMeteoForecast(latitude, longitude, forecastDays) {
  const key = forecastKey(latitude, longitude, forecastDays);
  const now = Date.now();
  const cached = forecastCache.get(key);
  if (cached && now - cached.cachedAt < FORECAST_CACHE_TTL_MS) return cached.data;
  if (forecastRequests.has(key)) return forecastRequests.get(key);

  const request = (async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=wind_speed_10m,weather_code,precipitation&hourly=wind_speed_10m,weather_code,precipitation,precipitation_probability&daily=weather_code,wind_speed_10m_max,precipitation_sum,precipitation_probability_max&forecast_days=${forecastDays}&timezone=auto`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw httpError(502, 'Failed to fetch weather from Open-Meteo.');
    const data = await response.json();
    forecastCache.set(key, { data, cachedAt: Date.now() });
    pruneForecastCache(Date.now());
    return data;
  })().finally(() => forecastRequests.delete(key));

  forecastRequests.set(key, request);
  return request;
}

async function getWeatherForecast(query) {
  const latitude = Number(query?.latitude ?? 14.2117);
  const longitude = Number(query?.longitude ?? 121.1653);
  const requestedDays = Number(query?.forecast_days ?? 7);
  const forecastDays = Number.isInteger(requestedDays) ? Math.min(16, Math.max(1, requestedDays)) : 7;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(400, 'Invalid weather coordinates.');
  }

  const [weather, hardwareSnapshot] = await Promise.all([
    loadOpenMeteoForecast(latitude, longitude, forecastDays),
    loadHardwareSensorSnapshot(),
  ]);
  const sensor = nearestHardwareClimate(hardwareSnapshot, latitude, longitude);
  return {
    ...weather,
    climate_source: hardwareSnapshot.source,
    climate_sensor_id: sensor?.id || null,
    climate_barangay_name: sensor?.barangayName || null,
    climate_updated_at: sensor?.updatedAt || hardwareSnapshot.updatedAt,
    current: {
      ...(weather.current || {}),
      temperature_2m: Number.isFinite(sensor?.temperatureCelsius) ? sensor.temperatureCelsius : null,
      relative_humidity_2m: Number.isFinite(sensor?.humidityPercentage) ? sensor.humidityPercentage : null,
    },
  };
}

module.exports = { getWeatherForecast };
