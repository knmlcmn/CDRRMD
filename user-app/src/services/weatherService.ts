import { api } from './api';

const CITY_LATITUDE = 14.2117;
const CITY_LONGITUDE = 121.1653;

export async function getCityCurrentWeather() {
  const response = await api.get(`/weather?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}`);
  return response.data ?? null;
}

export async function getCityForecastWeather() {
  const response = await api.get(`/weather?latitude=${CITY_LATITUDE}&longitude=${CITY_LONGITUDE}&forecast_days=7`);
  return response.data ?? null;
}
