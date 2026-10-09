function setPublicCache(res, { browserSeconds = 60, cdnSeconds = 600, staleSeconds = 86400 } = {}) {
  res.set('Cache-Control', `public, max-age=${browserSeconds}, s-maxage=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`);
}

module.exports = { setPublicCache };
