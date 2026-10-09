const weatherService = require('../services/weatherService');
const { setPublicCache } = require('../utils/httpCache');

async function getWeather(req, res) {
  const data = await weatherService.getWeatherForecast(req.query);
  setPublicCache(res, { browserSeconds: 60, cdnSeconds: 300 });
  return res.json(data);
}

module.exports = { getWeather };
