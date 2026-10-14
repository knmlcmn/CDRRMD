const weatherService = require('../services/weatherService');

async function getWeather(req, res) {
  const data = await weatherService.getWeatherForecast(req.query);
  // The Open-Meteo portion is cached inside weatherService for 12 minutes,
  // while this combined response remains short-lived so hardware climate
  // readings can refresh independently.
  res.set('Cache-Control', 'private, max-age=30');
  return res.json(data);
}

module.exports = { getWeather };
