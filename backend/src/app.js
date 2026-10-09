require('dotenv').config();

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

const configuredOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  'http://localhost:5173',
  ...configuredOrigins,
]);

// Global middleware stack for security, CORS, logging, and JSON body parsing.
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Native apps and server-to-server requests normally do not send Origin.
    const normalizedOrigin = origin?.replace(/\/$/, '');
    const isLocalDevelopmentOrigin = normalizedOrigin
      ? /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedOrigin)
      : false;

    if (!origin || allowedOrigins.has(normalizedOrigin) || isLocalDevelopmentOrigin) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
}));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  return res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/flood-risk', floodRiskRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backup-requests', require('./routes/backupRoutes'));
app.use('/api/barangay', barangayRoutes);
app.use('/api/rescuers', require('./routes/rescuerRoutes'));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Uploaded proof image is too large. Please upload a smaller image and try again.',
    });
  }

  // Known business errors are surfaced with their own status/code.
  if (err?.status) {
    return res.status(err.status).json({
      ...(err.code ? { code: err.code } : {}),
      message: err.message,
    });
  }

  // Unknown errors are treated as internal server failures.
  console.error(err);
  return res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;
