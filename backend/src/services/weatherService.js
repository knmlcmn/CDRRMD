const { httpError } = require('../utils/httpError');

async function getWeatherForecast(query) {
  const latitude = Number(query?.latitude ?? 14.2117);
  const longitude = Number(query?.longitude ?? 121.1653);
  const requestedDays = Number(query?.forecast_days ?? 7);
  const forecastDays = Number.isInteger(requestedDays) ? Math.min(16, Math.max(1, requestedDays)) : 7;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(400, 'Invalid weather coordinates.');
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m,apparent_temperature,precipitation&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,precipitation_probability_max&forecast_days=${forecastDays}&timezone=auto`;

  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    throw httpError(502, 'Failed to fetch weather from Open-Meteo.');
  }

  return response.json();
}

module.exports = { getWeatherForecast };
