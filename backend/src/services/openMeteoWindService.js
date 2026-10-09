const { httpError } = require('../utils/httpError');

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CALAMBA_BOUNDS = {
  latMin: 14.137703,
  latMax: 14.2662133,
  lonMin: 121.0218057,
  lonMax: 121.2214277,
};
const GRID_ROWS = 4;
const GRID_COLS = 5;

let cachedWindField = null;
let cachedWindFieldAt = 0;
let windFieldPromise = null;

function gridCoordinates() {
  const points = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    const latitude = CALAMBA_BOUNDS.latMax - ((CALAMBA_BOUNDS.latMax - CALAMBA_BOUNDS.latMin) * row) / (GRID_ROWS - 1);
    for (let col = 0; col < GRID_COLS; col += 1) {
      const longitude = CALAMBA_BOUNDS.lonMin + ((CALAMBA_BOUNDS.lonMax - CALAMBA_BOUNDS.lonMin) * col) / (GRID_COLS - 1);
      points.push({ row, col, latitude, longitude });
    }
  }
  return points;
}

function windVector(speedKph, directionDegrees) {
  // Meteorological direction is where the wind comes from. Particles need the
  // direction it travels toward, expressed as eastward/northward components.
  const speedMetersPerSecond = speedKph / 3.6;
  const directionRadians = directionDegrees * Math.PI / 180;
  return {
    u: -Math.sin(directionRadians) * speedMetersPerSecond,
    v: -Math.cos(directionRadians) * speedMetersPerSecond,
  };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function buildPointFrame(point, location, frameKey) {
  const current = location?.current || {};
  const hourly = location?.hourly || {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const precipitation = Array.isArray(hourly.precipitation) ? hourly.precipitation : [];
  const precipitationProbability = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : [];
  const windSpeed = Array.isArray(hourly.wind_speed_10m) ? hourly.wind_speed_10m : [];
  const windDirection = Array.isArray(hourly.wind_direction_10m) ? hourly.wind_direction_10m : [];
  const windGusts = Array.isArray(hourly.wind_gusts_10m) ? hourly.wind_gusts_10m : [];
  const temperatures = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const relativeHumidity = Array.isArray(hourly.relative_humidity_2m) ? hourly.relative_humidity_2m : [];
  const currentTime = String(current.time || '');
  const locatedFutureIndex = times.findIndex((time) => String(time) > currentTime);
  const firstFutureIndex = locatedFutureIndex >= 0 ? locatedFutureIndex : Math.max(0, times.length - 1);

  let forecastIndex = firstFutureIndex;
  let rainAmountMm = safeNumber(current.precipitation);
  let rainProbabilityPct = safeNumber(precipitationProbability[firstFutureIndex]);
  let speedKph = safeNumber(current.wind_speed_10m);
  let directionDegrees = safeNumber(current.wind_direction_10m);
  let gustKph = safeNumber(current.wind_gusts_10m, speedKph);
  let temperatureCelsius = safeNumber(current.temperature_2m);
  let relativeHumidityPct = safeNumber(current.relative_humidity_2m);
  let forecastAt = currentTime || new Date().toISOString();

  if (String(frameKey).startsWith('hour_')) {
    const hourOffset = Math.max(0, Number(String(frameKey).slice(5)) || 0);
    const hourIndex = Math.min(times.length - 1, firstFutureIndex + hourOffset);
    forecastIndex = hourIndex;
    rainAmountMm = safeNumber(precipitation[hourIndex]);
    rainProbabilityPct = safeNumber(precipitationProbability[hourIndex]);
    speedKph = safeNumber(windSpeed[forecastIndex]);
    directionDegrees = safeNumber(windDirection[forecastIndex]);
    gustKph = safeNumber(windGusts[forecastIndex], speedKph);
    temperatureCelsius = safeNumber(temperatures[forecastIndex], temperatureCelsius);
    relativeHumidityPct = safeNumber(relativeHumidity[forecastIndex], relativeHumidityPct);
    forecastAt = times[hourIndex] || forecastAt;
  }

  if (!Number.isFinite(speedKph) || !Number.isFinite(directionDegrees)) {
    throw new Error('Open-Meteo returned invalid weather values.');
  }
  const vector = windVector(Math.max(0, speedKph), directionDegrees);
  return {
    ...point,
    u: Number(vector.u.toFixed(3)),
    v: Number(vector.v.toFixed(3)),
    speedKph: Number(Math.max(0, speedKph).toFixed(1)),
    gustKph: Number(Math.max(0, gustKph).toFixed(1)),
    directionDegrees: Number(directionDegrees.toFixed(1)),
    rainAmountMm: Number(Math.max(0, rainAmountMm).toFixed(2)),
    rainProbabilityPct: Number(Math.max(0, Math.min(100, rainProbabilityPct)).toFixed(0)),
    temperatureCelsius: Number(temperatureCelsius.toFixed(1)),
    relativeHumidityPct: Number(Math.max(0, Math.min(100, relativeHumidityPct)).toFixed(0)),
    forecastAt,
  };
}

async function fetchOpenMeteoBatch(points, attempt = 0) {
  const params = new URLSearchParams({
    latitude: points.map((point) => point.latitude.toFixed(4)).join(','),
    longitude: points.map((point) => point.longitude.toFixed(4)).join(','),
    current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kmh',
    timezone: 'Asia/Manila',
    // Eight days guarantees a complete rolling 7-day window even when the
    // provider aligns the first hourly value to a model-cycle boundary.
    forecast_hours: '192',
  });
  try {
    const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo returned ${response.status}.`);
    }
    const payload = await response.json();
    const locations = Array.isArray(payload) ? payload : [payload];
    if (locations.length !== points.length) {
      throw new Error('Open-Meteo returned an incomplete weather grid.');
    }
    return locations;
  } catch (error) {
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return fetchOpenMeteoBatch(points, attempt + 1);
    }
    throw error;
  }
}

async function fetchOpenMeteoGrid(points) {
  // Smaller responses are substantially more reliable for the 8-day hourly
  // series than one large 20-location response. Flattening preserves grid order.
  const batches = [];
  for (let index = 0; index < points.length; index += 5) {
    batches.push(points.slice(index, index + 5));
  }
  const batchResponses = await Promise.all(batches.map((batch) => fetchOpenMeteoBatch(batch)));
  const locations = batchResponses.flat();

  const firstForecastIndex = Math.max(0, locations[0]?.hourly?.time?.findIndex((time) => String(time) > String(locations[0]?.current?.time || '')) || 0);
  const definitions = Object.fromEntries(Array.from({ length: 168 }, (_, hourOffset) => {
    const time = locations[0]?.hourly?.time?.[firstForecastIndex + hourOffset];
    const date = time ? new Date(time) : new Date();
    return [`hour_${hourOffset}`, {
      label: date.toLocaleDateString('en-US', { weekday: 'long' }),
      dateLabel: date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
      hourLabel: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      rainWindow: 'Hourly rain accumulation',
    }];
  }));
  const frames = {};
  Object.keys(definitions).forEach((frameKey) => {
    const framePoints = points.map((point, index) => buildPointFrame(point, locations[index], frameKey));
    const averageSpeedKph = framePoints.reduce((sum, point) => sum + point.speedKph, 0) / framePoints.length;
    const maximumGustKph = framePoints.reduce((max, point) => Math.max(max, point.gustKph), 0);
    const averageRainAmountMm = framePoints.reduce((sum, point) => sum + point.rainAmountMm, 0) / framePoints.length;
    const averageTemperatureCelsius = framePoints.reduce((sum, point) => sum + point.temperatureCelsius, 0) / framePoints.length;
    const averageRelativeHumidityPct = framePoints.reduce((sum, point) => sum + point.relativeHumidityPct, 0) / framePoints.length;
    frames[frameKey] = {
      ...definitions[frameKey],
      source: 'Open-Meteo',
      forecastAt: framePoints[0]?.forecastAt || new Date().toISOString(),
      averageSpeedKph: Number(averageSpeedKph.toFixed(1)),
      maximumGustKph: Number(maximumGustKph.toFixed(1)),
      averageRainAmountMm: Number(averageRainAmountMm.toFixed(2)),
      averageTemperatureCelsius: Number(averageTemperatureCelsius.toFixed(1)),
      averageRelativeHumidityPct: Number(averageRelativeHumidityPct.toFixed(0)),
      rows: GRID_ROWS,
      cols: GRID_COLS,
      bounds: CALAMBA_BOUNDS,
      points: framePoints,
    };
  });
  return frames;
}

async function getCalambaWindField() {
  const now = Date.now();
  if (cachedWindField && now - cachedWindFieldAt < CACHE_TTL_MS) {
    return cachedWindField;
  }

  if (windFieldPromise) {
    return windFieldPromise;
  }

  windFieldPromise = (async () => {
    try {
      const frames = await fetchOpenMeteoGrid(gridCoordinates());
      const currentFrame = frames.hour_0;
      cachedWindField = {
        source: 'Open-Meteo',
        sourceUrl: 'https://open-meteo.com/',
        model: 'best_match',
        level: '10 m above ground',
        units: { vector: 'm/s', speed: 'km/h', direction: 'degrees' },
        updatedAt: new Date().toISOString(),
        forecastAt: currentFrame.forecastAt,
        averageSpeedKph: currentFrame.averageSpeedKph,
        maximumGustKph: currentFrame.maximumGustKph,
        averageRainAmountMm: currentFrame.averageRainAmountMm,
        averageTemperatureCelsius: currentFrame.averageTemperatureCelsius,
        averageRelativeHumidityPct: currentFrame.averageRelativeHumidityPct,
        rows: GRID_ROWS,
        cols: GRID_COLS,
        bounds: CALAMBA_BOUNDS,
        points: currentFrame.points,
        frames,
      };
      cachedWindFieldAt = Date.now();
      return cachedWindField;
    } catch (error) {
      if (cachedWindField) {
        return { ...cachedWindField, stale: true };
      }
      throw httpError(502, `Unable to load weather data from Open-Meteo: ${error.message}`, 'OPEN_METEO_UNAVAILABLE');
    } finally {
      windFieldPromise = null;
    }
  })();

  return windFieldPromise;
}

module.exports = { getCalambaWindField };
