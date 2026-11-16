export const RESPONSIVE_BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

export type ResponsiveMode = 'mobile' | 'tablet' | 'desktop';

export function getResponsiveMode(width: number): ResponsiveMode {
  if (width >= RESPONSIVE_BREAKPOINTS.desktop) return 'desktop';
  if (width >= RESPONSIVE_BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}
