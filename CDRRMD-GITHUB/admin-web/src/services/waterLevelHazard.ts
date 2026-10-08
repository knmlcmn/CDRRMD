export const MODERATE_WATER_LEVEL_THRESHOLD = 40;
export const HIGH_WATER_LEVEL_THRESHOLD = 61;

export type HardwareFloodLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'UNAVAILABLE';

export const HARDWARE_FLOOD_COLORS: Record<HardwareFloodLevel, string> = {
  LOW: '#0284c7',
  MODERATE: '#d97706',
  HIGH: '#b91c1c',
  UNAVAILABLE: '#64748b',
};
