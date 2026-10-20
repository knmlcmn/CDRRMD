
require('./config/loadEnv');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const pool = require('./config/db');
const { getRedisState } = require('./config/redis');
const { getRuntimeConfigStatus } = require('./config/runtimeConfig');
const auth = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');
const { performanceMiddleware, snapshot: performanceSnapshot } = require('./services/performanceMonitor');
const { getCacheStats } = require('./services/cacheService');
const authRoutes = require('./routes/authRoutes');
const contentRoutes = require('./routes/contentRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const floodRiskRoutes = require('./routes/floodRiskRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const barangayRoutes = require('./routes/barangayRoutes');

const app = express();
app.set('trust proxy', 1);

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

app.use(performanceMiddleware);

app.use('/api', rateLimit({
  namespace: 'api',
  limit: Number(process.env.API_RATE_LIMIT || 3_000),
  windowMs: Number(process.env.API_RATE_WINDOW_MS || 60_000),
  skip: (req) => req.method === 'OPTIONS' || ['/health', '/ready'].includes(req.path) || (
    ['POST', 'PUT', 'PATCH'].includes(req.method) && (
      req.path === '/reports' ||
      req.path.startsWith('/backup-requests') ||
      req.path.startsWith('/rescuers/location')
    )
  ),
}));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '35mb',
}));

// Fast liveness check. Use /api/ready for dependency readiness.
app.get('/api/health', (req, res) => res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) }));

app.get('/api/ready', async (req, res) => {
  await pool.query('SELECT 1');
  const configuration = getRuntimeConfigStatus();
  const ready = Object.values(configuration).every(Boolean);
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'configuration_required',
    configuration,
    redis: getRedisState(),
  });
});

app.get('/api/performance', auth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  return res.json({
    generatedAt: new Date().toISOString(),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Object.fromEntries(Object.entries(process.memoryUsage()).map(([key, value]) => [key, Number((value / 1048576).toFixed(2))])),
    },
    databasePool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
    redis: getRedisState(),
    cache: getCacheStats(),
    routes: performanceSnapshot(),
  });
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
