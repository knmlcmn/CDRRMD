import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { logMapLifecycle, markInitializationEnd, markInitializationStart } from '../utils/performanceDiagnostics';

let nextPlatformMapInstanceId = 0;

type PlatformMapProps = {
  html: string;
  baseUrl?: string;
  style?: StyleProp<ViewStyle>;
  onMessage?: (data: string) => void;
  preserveState?: boolean;
  updateMessage?: object | null;
};

function PlatformMap({
  html,
  baseUrl,
  style,
  onMessage,
  preserveState = false,
  updateMessage = null,
}: PlatformMapProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView>(null);
  const lastPostedMessageRef = useRef('');
  const initialHtmlRef = useRef(html);
  const initializationMarkerRef = useRef<ReturnType<typeof markInitializationStart>>(null);
  const instanceIdRef = useRef(0);
  const loadSequenceRef = useRef(0);
  const updateMessageRef = useRef(updateMessage);
  const onMessageRef = useRef(onMessage);
  if (instanceIdRef.current === 0) instanceIdRef.current = ++nextPlatformMapInstanceId;
  updateMessageRef.current = updateMessage;
  onMessageRef.current = onMessage;
  const renderedHtml = preserveState ? initialHtmlRef.current : html;
  const nativeSource = useMemo(
    () => (baseUrl ? { html: renderedHtml, baseUrl } : { html: renderedHtml }),
    [baseUrl, renderedHtml],
  );

  const postUpdate = useCallback((force = false) => {
    const nextUpdate = updateMessageRef.current;
    if (!nextUpdate) return;
    const message = JSON.stringify(nextUpdate);
    if (!force && message === lastPostedMessageRef.current) return;
    lastPostedMessageRef.current = message;
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(nextUpdate, '*');
    } else {
      webViewRef.current?.postMessage(message);
    }
  }, []);

  useEffect(() => {
    if (preserveState) postUpdate();
  }, [postUpdate, preserveState, updateMessage]);

  useEffect(() => {
    const instanceId = instanceIdRef.current;
    logMapLifecycle('component-mount', instanceId, loadSequenceRef.current);
    if (Platform.OS === 'web') {
      initializationMarkerRef.current = markInitializationStart('PlatformMap/WebView');
    }
    return () => {
      logMapLifecycle('component-unmount', instanceId, loadSequenceRef.current);
      initializationMarkerRef.current = null;
    };
  }, []);

  const handleMessageData = useCallback((data: string) => {
    try {
      const event = JSON.parse(data);
      if (event?.type === 'map-lifecycle' && event.lifecycle === 'leaflet-ready') {
        logMapLifecycle('leaflet-ready', instanceIdRef.current, loadSequenceRef.current);
      }
    } catch {
      // Parent handlers still receive non-JSON WebView messages unchanged.
    }
    onMessageRef.current?.(data);
  }, []);

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
        handleMessageData(event.data);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessageData]);

  const handleNativeMessage = useCallback((event: WebViewMessageEvent) => {
    handleMessageData(event.nativeEvent.data);
  }, [handleMessageData]);

  const handleLoadStart = useCallback(() => {
    loadSequenceRef.current += 1;
    initializationMarkerRef.current = markInitializationStart('PlatformMap/WebView');
    logMapLifecycle('document-load-start', instanceIdRef.current, loadSequenceRef.current);
  }, []);

  const handleLoaded = useCallback(() => {
    markInitializationEnd(initializationMarkerRef.current);
    initializationMarkerRef.current = null;
    logMapLifecycle('document-load-end', instanceIdRef.current, loadSequenceRef.current);
    postUpdate(true);
  }, [postUpdate]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          title="Rescue Map"
          srcDoc={renderedHtml}
          allow="geolocation"
          onLoad={handleLoaded}
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
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoaded}
        style={styles.webView}
      />
    </View>
  );
}

export default memo(PlatformMap);

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
