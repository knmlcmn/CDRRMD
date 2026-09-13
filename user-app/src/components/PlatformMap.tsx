import React, { useEffect, useRef } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type PlatformMapProps = {
  html: string;
  style?: StyleProp<ViewStyle>;
  onMessage?: (data: string) => void;
};

export default function PlatformMap({
  html,
  style,
  onMessage,
}: PlatformMapProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        iframeRef.current &&
        event.source !== iframeRef.current.contentWindow
      ) {
        return;
      }

      if (typeof event.data === 'string') {
        onMessage?.(event.data);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onMessage]);

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    onMessage?.(event.nativeEvent.data);
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          title="Rescue Map"
          srcDoc={html}
          allow="geolocation"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        onMessage={handleNativeMessage}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },

  webView: {
    flex: 1,
  },
});