const weatherService = require('../services/weatherService');

async function getWeather(req, res) {
  const data = await weatherService.getWeatherForecast(req.query);
  return res.json(data);
}

module.exports = { getWeather };
