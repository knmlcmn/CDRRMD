const { createClient } = require('redis');

const REDIS_URL = String(process.env.REDIS_URL || '').trim();
const RETRY_DELAY_MS = 10_000;

let client = null;
let connectPromise = null;
let connectScheduled = false;
let retryAfter = 0;
let lastErrorLogAt = 0;

function logRedisError(error) {
  const now = Date.now();
  if (now - lastErrorLogAt < 30_000) return;
  lastErrorLogAt = now;
  console.error('Redis unavailable; continuing with local fallbacks:', error.message);
}

async function getRedisClient() {
  if (!REDIS_URL || Date.now() < retryAfter) return null;
  if (client?.isReady) return client;
  if (connectPromise) return connectPromise;

  client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 1_500,
      reconnectStrategy: false,
    },
  });
  client.on('error', logRedisError);

  connectPromise = client.connect()
    .then(() => client)
    .catch((error) => {
      logRedisError(error);
      retryAfter = Date.now() + RETRY_DELAY_MS;
      const failedClient = client;
      try {
        if (failedClient?.isOpen) failedClient.destroy();
      } catch {
        // The socket may already be closed after a refused connection.
      }
      if (client === failedClient) client = null;
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

async function runWithRedis(operation, fallback = null) {
  // Never put Redis connection establishment on an API request's critical
  // path. Operations use Redis once ready and fail open locally meanwhile.
  if (!client?.isReady) {
    if (REDIS_URL && !connectPromise && !connectScheduled && Date.now() >= retryAfter) {
      connectScheduled = true;
      setImmediate(() => {
        connectScheduled = false;
        void getRedisClient();
      });
    }
    return fallback;
  }
  try {
    return await operation(client);
  } catch (error) {
    logRedisError(error);
    return fallback;
  }
}

function getRedisState() {
  return {
    configured: Boolean(REDIS_URL),
    ready: Boolean(client?.isReady),
  };
}

module.exports = { getRedisClient, getRedisState, runWithRedis };
