const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_SECRET || 'cddrmd-dev-access-secret';

function auth(req, res, next) {
  // Expect standard Bearer token format.
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 'AUTH_TOKEN_MISSING',
      message: 'Missing or invalid token.',
    });
  }

  const token = header.split(' ')[1];
  if (!token) {
    return res.status(401).json({
      code: 'AUTH_TOKEN_MISSING',
      message: 'Missing or invalid token.',
    });
  }

  try {
    // Attach decoded JWT payload so downstream handlers know the actor.
    const decoded = jwt.verify(token, ACCESS_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      code: 'AUTH_TOKEN_INVALID',
      message: 'Token is invalid or expired.',
    });
  }
}

module.exports = auth;
