// authFlexible — like auth but also accepts token from request body (for sendBeacon / tab-close).
const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_SECRET || 'cddrmd-dev-access-secret';

function authFlexible(req, res, next) {
  // Try Authorization header first (normal flow).
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1] || null;
  }

  // Fallback: token passed in JSON body (sendBeacon on tab-close).
  if (!token && req.body && req.body.token) {
    token = String(req.body.token);
  }

  if (!token) {
    return res.status(401).json({ code: 'AUTH_TOKEN_MISSING', message: 'Missing or invalid token.' });
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ code: 'AUTH_TOKEN_INVALID', message: 'Token is invalid or expired.' });
  }
}

module.exports = authFlexible;
