import { useWindowDimensions } from 'react-native';

export const MAX_CONTENT_WIDTH = 760;
export const MAX_MAP_CONTENT_WIDTH = 920;

export function useResponsiveLayout(maxContentWidth = MAX_CONTENT_WIDTH) {
  const { width, height } = useWindowDimensions();
  const viewportWidth = Math.max(240, width);
  const contentWidth = Math.min(viewportWidth, maxContentWidth);

  return {
    width: viewportWidth,
    height,
    contentWidth,
    horizontalPadding: viewportWidth < 360 ? 10 : viewportWidth < 768 ? 14 : 20,
    isSmall: viewportWidth < 360,
    isTablet: viewportWidth >= 600,
    isDesktop: viewportWidth >= 1024,
    uiScale: Math.min(Math.max(contentWidth / 216, 1), 1.82),
  };
}
