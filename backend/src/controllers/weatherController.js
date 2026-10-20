const weatherService = require('../services/weatherService');

async function getWeather(req, res) {
  const data = await weatherService.getWeatherForecast(req.query);
  // Open-Meteo is cached server-side, but hardware values are intentionally
  // never cached by browsers or proxies.
  res.set('Cache-Control', 'no-store');
  return res.json(data);
}

module.exports = { getWeather };
