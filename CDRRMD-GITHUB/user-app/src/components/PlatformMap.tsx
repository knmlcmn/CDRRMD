import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
  baseUrl?: string;
  style?: StyleProp<ViewStyle>;
  onMessage?: (data: string) => void;
  preserveState?: boolean;
  updateMessage?: object | null;
};

export default function PlatformMap({
  html,
  baseUrl,
  style,
  onMessage,
  preserveState = false,
  updateMessage = null,
}: PlatformMapProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView>(null);
  const initialHtmlRef = useRef(html);
  const renderedHtml = preserveState ? initialHtmlRef.current : html;
  const nativeSource = useMemo(
    () => (baseUrl ? { html: renderedHtml, baseUrl } : { html: renderedHtml }),
    [baseUrl, renderedHtml],
  );

  const postUpdate = useCallback(() => {
    if (!updateMessage) return;
    const message = JSON.stringify(updateMessage);
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(updateMessage, '*');
    } else {
      webViewRef.current?.postMessage(message);
    }
  }, [updateMessage]);

  useEffect(() => {
    if (preserveState) postUpdate();
  }, [postUpdate, preserveState]);

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
          srcDoc={renderedHtml}
          allow="geolocation"
          onLoad={postUpdate}
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
        ref={webViewRef}
        originWhitelist={['*']}
        source={nativeSource}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        setBuiltInZoomControls={false}
        mixedContentMode="always"
        onMessage={handleNativeMessage}
        onLoadEnd={postUpdate}
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
