const SUNNY_IMAGE = require('../../assets/istockphoto-1007768414-612x612.jpg');
const RAINY_IMAGE = require('../../assets/0418743ee613b442f109f57bc0bb7768.jpg');
const DEFAULT_SKY_IMAGE = 'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=1200&auto=format&fit=crop';
const CLOUDY_IMAGE = 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1200&auto=format&fit=crop';
const RAINY_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const THUNDER_CODES = new Set([95, 96, 99]);

export type WeatherConditionKind = 'sunny' | 'partlyCloudy' | 'cloudy' | 'rainy' | 'thunder';

export function getWeatherConditionKind(weatherCode?: number): WeatherConditionKind {
  if (weatherCode === 0 || weatherCode === 1) return 'sunny';
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return 'cloudy';
  if (weatherCode !== undefined && THUNDER_CODES.has(weatherCode)) return 'thunder';
  if (weatherCode !== undefined && RAINY_CODES.has(weatherCode)) return 'rainy';
  return 'partlyCloudy';
}

export function getWeatherVisualByCode(weatherCode?: number) {
  if (weatherCode === undefined || weatherCode === null) {
    return {
      condition: 'Unknown',
      backgroundUri: DEFAULT_SKY_IMAGE,
    };
  }

  const condition = getWeatherConditionKind(weatherCode);
  if (condition === 'thunder') {
    return {
      condition: 'Thunderstorm',
      backgroundUri: RAINY_IMAGE,
    };
  }

  if (condition === 'rainy') {
    return {
      condition: 'Rainy',
      backgroundUri: RAINY_IMAGE,
    };
  }

  if (condition === 'sunny') {
    return {
      condition: 'Sunny',
      backgroundUri: SUNNY_IMAGE,
    };
  }

  if (condition === 'cloudy') {
    return {
      condition: 'Cloudy',
      backgroundUri: CLOUDY_IMAGE,
    };
  }

  return {
    condition: 'Partly Cloudy',
    backgroundUri: DEFAULT_SKY_IMAGE,
  };
}
