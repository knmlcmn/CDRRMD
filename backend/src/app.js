
require('./config/loadEnv');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const contentRoutes = require('./routes/contentRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const floodRiskRoutes = require('./routes/floodRiskRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const barangayRoutes = require('./routes/barangayRoutes');

const app = express();

// Normalize frontend URLs for CORS.
function normalizeOrigin(origin) {
  return String(origin || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

// Read authorized frontend URLs from environment variables.
const configuredOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://web-admin-zeta-five.vercel.app',
  ...configuredOrigins,
].map(normalizeOrigin));

// Security and CORS middleware.
app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = normalizeOrigin(origin);

    const isLocalDevelopmentOrigin =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin);

    if (
      allowedOrigins.has(normalizedOrigin) ||
      isLocalDevelopmentOrigin
    ) {
      return callback(null, true);
    }

    const error = new Error(
      `Origin ${origin} is not allowed by CORS.`
    );
    error.status = 403;
    return callback(error);
  },
}));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '35mb',
}));

// Health check.
app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  return res.json({ status: 'ok' });
});

// API routes.
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/flood-risk', floodRiskRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use(
  '/api/backup-requests',
  require('./routes/backupRoutes')
);
app.use('/api/barangay', barangayRoutes);
app.use('/api/rescuers', require('./routes/rescuerRoutes'));
app.use('/api/family', require('./routes/familyRoutes'));
app.use('/api/history', require('./routes/historyRoutes'));

// Error handling.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      message:
        'Uploaded proof image is too large. Please upload a smaller image and try again.',
    });
  }

  if (err?.status) {
    return res.status(err.status).json({
      ...(err.code ? { code: err.code } : {}),
      message: err.message,
    });
  }

  console.error(err);

  return res.status(500).json({
    message: 'Internal server error.',
  });
});

module.exports = app;
