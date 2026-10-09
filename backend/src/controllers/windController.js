const { getCalambaWindField } = require('../services/openMeteoWindService');
const { setPublicCache } = require('../utils/httpCache');

async function getWindField(req, res) {
  const data = await getCalambaWindField();
  setPublicCache(res);
  return res.json(data);
}

module.exports = { getWindField };
