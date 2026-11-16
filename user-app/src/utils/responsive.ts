import { Platform, useWindowDimensions } from 'react-native';
import { getResponsiveMode } from './responsivePolicy';

export { getResponsiveMode, RESPONSIVE_BREAKPOINTS, type ResponsiveMode } from './responsivePolicy';

export const MAX_CONTENT_WIDTH = 760;
export const MAX_MAP_CONTENT_WIDTH = 920;
export const WEB_DESKTOP_CONTENT_WIDTH = 1180;
export const WEB_DESKTOP_MAP_WIDTH = 1320;

export function useResponsiveLayout(maxContentWidth = MAX_CONTENT_WIDTH) {
  const { width, height } = useWindowDimensions();
  const viewportWidth = Math.max(240, width);
  const contentWidth = Math.min(viewportWidth, maxContentWidth);
  const mode = getResponsiveMode(viewportWidth);
  const isWeb = Platform.OS === 'web';

  return {
    width: viewportWidth,
    height,
    contentWidth,
    horizontalPadding: viewportWidth < 360 ? 10 : viewportWidth < 768 ? 14 : viewportWidth < 1024 ? 20 : 28,
    isSmall: viewportWidth < 360,
    isTablet: viewportWidth >= 600,
    isDesktop: mode === 'desktop',
    isWeb,
    isWebTablet: isWeb && mode === 'tablet',
    isWebDesktop: isWeb && mode === 'desktop',
    mode,
    uiScale: Math.min(Math.max(contentWidth / 216, 1), 1.82),
  };
}
