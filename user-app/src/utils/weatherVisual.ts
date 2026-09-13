const SUNNY_IMAGE = require('../../assets/istockphoto-1007768414-612x612.jpg');
const RAINY_IMAGE = require('../../assets/0418743ee613b442f109f57bc0bb7768.jpg');

export function getWeatherVisualByCode(weatherCode?: number) {
  if (weatherCode === undefined || weatherCode === null) {
    return {
      condition: 'Unknown',
      backgroundUri:
        'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=1200&auto=format&fit=crop',
    };
  }

  const rainyCodes = [
    51, 53, 55, 56, 57,
    61, 63, 65, 66, 67,
    80, 81, 82,
    95, 96, 99,
  ];

  const sunnyCodes = [0, 1];
  const partlyCloudyCodes = [2];
  const cloudyCodes = [3, 45, 48];

  if (rainyCodes.includes(weatherCode)) {
    return {
      condition: 'Rainy',
      backgroundUri: RAINY_IMAGE,
    };
  }

  if (sunnyCodes.includes(weatherCode)) {
    return {
      condition: 'Sunny',
      backgroundUri: SUNNY_IMAGE,
    };
  }

  if (partlyCloudyCodes.includes(weatherCode)) {
    return {
      condition: 'Partly Cloudy',
      backgroundUri:
        'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=1200&auto=format&fit=crop',
    };
  }

  if (cloudyCodes.includes(weatherCode)) {
    return {
      condition: 'Cloudy',
      backgroundUri:
        'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1200&auto=format&fit=crop',
    };
  }

  return {
    condition: 'Partly Cloudy',
    backgroundUri:
      'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=1200&auto=format&fit=crop',
  };
}