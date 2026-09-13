const { httpError } = require('../utils/httpError');

async function getWeatherForecast(query) {
  const latitude = Number(query?.latitude ?? 14.2117);
  const longitude = Number(query?.longitude ?? 121.1653);
  const forecastDays = Math.min(16, Math.max(1, Number(query?.forecast_days ?? 14)));

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,weather_code,relative_humidity_2m,apparent_temperature&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max&forecast_days=${forecastDays}&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) {
    throw httpError(502, 'Failed to fetch weather from Open-Meteo.');
  }

  return response.json();
}

module.exports = { getWeatherForecast };
