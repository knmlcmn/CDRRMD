import { api } from './apiClient';

type RainImpactPayload = {
  cityWeather?: {
    rainIntensityMmPerHour?: number;
  };
};

export async function isCalambaCurrentlyRainy() {
  try {
    const { data } = await api.get<RainImpactPayload>('/flood-risk/calamba/rain-impact');
    return Number(data?.cityWeather?.rainIntensityMmPerHour || 0) > 0;
  } catch {
    return false;
  }
}
