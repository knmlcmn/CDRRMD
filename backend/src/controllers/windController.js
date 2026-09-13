const { getCalambaWindField } = require('../services/openMeteoWindService');

async function getWindField(req, res) {
  const data = await getCalambaWindField();
  return res.json(data);
}

module.exports = { getWindField };
