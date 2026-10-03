import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

type NotificationArtworkProps = {
  scale: number;
  showUnread: boolean;
};

// Recreates Rectangle 36, Bell-Icon, and Rectangle 35 from custom icons.
export function NotificationArtwork({ scale, showUnread }: NotificationArtworkProps) {
  return (
    <View pointerEvents="none" style={[styles.canvas, {
      width: 29 * scale,
      height: 29 * scale,
    }]}>
      <View style={[styles.background, {
        width: 29.7 * scale,
        height: 22 * scale,
        borderRadius: 11 * scale,
        shadowRadius: 1.75 * scale,
        shadowOffset: { width: 0, height: 1.25 * scale },
      }]} />

      <Svg
        style={styles.bell}
        width={11 * scale}
        height={10.45 * scale}
        viewBox="0 0 20 19"
        fill="none"
      >
        <Path
          d="M12.5869 17.0859C12.2309 17.8607 11.3082 18.5 10.0049 18.5C8.68992 18.4999 7.77015 17.8586 7.41992 17.0859H12.5869ZM10.0049 0.5C11.3407 0.5 12.2569 1.29344 12.583 2.26758L12.665 2.51172L12.9111 2.58691C14.2062 2.98272 15.0755 3.71364 15.6426 4.73438C16.2194 5.77269 16.5016 7.14319 16.543 8.83203V8.84375L16.5439 8.85547C16.5818 9.38477 16.6503 10.0022 16.8076 10.5762C16.9628 11.1422 17.2197 11.7265 17.6748 12.1309L17.6787 12.1338C18.1608 12.5531 18.6233 12.9268 18.9814 13.3154C19.3448 13.7097 19.5 14.0169 19.5 14.2705C19.5 14.4217 19.4394 14.5448 19.291 14.6484C19.1266 14.7631 18.8376 14.8603 18.3994 14.8604H1.60059C1.16891 14.8604 0.878605 14.7641 0.711914 14.6484C0.5603 14.5431 0.5 14.4184 0.5 14.2705C0.500142 14.0181 0.65622 13.7116 1.02148 13.3164C1.20187 13.1213 1.40767 12.9307 1.62793 12.7363L2.32227 12.1328C2.78452 11.7279 3.04117 11.1422 3.19629 10.5762C3.35343 10.0027 3.42295 9.38572 3.46582 8.86035L3.4668 8.8457L3.46777 8.83008C3.504 7.14243 3.78562 5.7724 4.3623 4.73438C4.92958 3.71349 5.79904 2.98165 7.08887 2.58594L7.33203 2.51172L7.41504 2.27148C7.75195 1.29213 8.65976 0.500125 10.0049 0.5Z"
          fill="#F9F9F9"
          stroke="#000000"
        />
      </Svg>

      {showUnread ? (
        <Svg
          style={styles.unreadDot}
          width={6.6 * scale}
          height={6.6 * scale}
          viewBox="0 0 12 12"
          fill="none"
        >
          <Rect width={12} height={12} rx={6} fill="#CC2828" stroke="#000000" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  background: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    elevation: 2,
    zIndex: 0,
  },
  bell: {
    elevation: 3,
    zIndex: 1,
  },
  unreadDot: {
    position: 'absolute',
    right: 0,
    top: 0,
    elevation: 4,
    zIndex: 2,
  },
});
