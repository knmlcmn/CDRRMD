import { useEffect, useRef, useState } from 'react';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Animated, AppState, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppText as Text, TypographyProvider } from './src/components/Typography';
import {
  NavigationIcon,
  NavigationIconName,
  SosNavigationIcon,
} from './src/components/NavigationArtwork';
import HomeScreen from './src/screens/HomeScreen';
import WeatherScreen from './src/screens/WeatherScreen';
import RescueMapScreen from './src/screens/RescueMapScreen';
import FamilyScreen from './src/screens/FamilyScreen';
import MeScreen from './src/screens/MeScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import {
  clearSession,
  loadSession,
  registerSessionAuthorizationSetter,
  saveSession,
  SessionData,
} from './src/services/session';
import { AppProfile, ensureAccountForSession, patchAccountProfile } from './src/services/appAccount';
import {
  assignAuthBarangayFromLocation,
  getAuthMe,
  logoutAuthSession,
  putAuthMe,
  setApiAuthorizationToken,
  setAuthFailureHandler,
} from './src/services/api';
import {
  handleAuthFailureForSession,
  handleAuthFailureIfSessionActive,
} from './src/services/authRequestPolicy';
import ResidentFloodAlert from './src/components/ResidentFloodAlert';
import RequiredLocationModal from './src/components/RequiredLocationModal';
import LogoutConfirmationModal from './src/components/LogoutConfirmationModal';
import { useResponsiveLayout } from './src/utils/responsive';
import { LiveLocation, requireLiveLocation } from './src/services/locationAccess';
import { loadTestMode, saveTestMode } from './src/services/testMode';
import RescuerPortal from './src/rescuer/RescuerPortal';
import type { ResponderRole } from './src/rescuer/types';
import {
  beginResidentPushNotificationSession,
  registerResidentPushNotifications,
  subscribeToPushTokenChanges,
  unregisterResidentPushNotifications,
} from './src/services/pushNotifications';
import {
  beginPerformanceStage,
  endPerformanceStage,
  logRuntimeDiagnostics,
  markNavigationSettled,
  markNavigationStart,
  startJsStallMonitor,
} from './src/utils/performanceDiagnostics';

function isBlank(value?: string | null) {
  return !String(value ?? '').trim();
}

function hasAnyProfileValue(profile?: AppProfile | null) {
  if (!profile) {
    return false;
  }

  return Boolean(
    profile.firstName.trim() ||
    profile.lastName.trim() ||
    profile.email.trim() ||
    profile.address.trim() ||
    profile.contactNumber.trim(),
  );
}

async function syncMissingServerProfile(
  sessionCandidate: SessionData,
  localProfile: AppProfile,
) {
  const needsBackfill =
    isBlank(sessionCandidate.user.firstName) ||
    isBlank(sessionCandidate.user.lastName) ||
    isBlank(sessionCandidate.user.address) ||
    isBlank(sessionCandidate.user.contactNumber);

  if (!needsBackfill || !hasAnyProfileValue(localProfile)) {
    return sessionCandidate;
  }

  const response = await putAuthMe({
    firstName: localProfile.firstName,
    lastName: localProfile.lastName,
    email: localProfile.email || sessionCandidate.user.email,
    address: localProfile.address,
    contactNumber: localProfile.contactNumber,
  });

  const serverUser = response.data?.user;
  if (!serverUser?.id) {
    return sessionCandidate;
  }

  return {
    ...sessionCandidate,
    user: {
      ...sessionCandidate.user,
      ...serverUser,
    },
  };
}

const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<any>();

type NavigationTabButtonProps = {
  name: string;
  focused: boolean;
  scale: number;
  onPress: () => void;
};

function NavigationTabButton({ name, focused, scale, onPress }: NavigationTabButtonProps) {
  const isSos = name === 'SOS';
  const hover = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  const motion = {
    transform: [
      { translateY: hover.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5 * scale] }) },
      { scale: hover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
      { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) },
    ],
  };

  function animateHover(toValue: number) {
    Animated.timing(hover, { toValue, duration: 150, useNativeDriver: true }).start();
  }

  function animatePress(toValue: number) {
    Animated.timing(press, { toValue, duration: 95, useNativeDriver: true }).start();
  }

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={name}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onHoverIn={() => animateHover(1)}
      onHoverOut={() => animateHover(0)}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabAnimatedContent, motion]}>
        {isSos ? (
          <View style={[styles.sosTabIconCircle, {
            width: 43 * scale,
            height: 40 * scale,
            borderRadius: 21.5 * scale,
            marginTop: -3 * scale,
            shadowRadius: 2 * scale,
            shadowOffset: { width: 0, height: 2 * scale },
          }]}>
            <SosNavigationIcon selected={focused} scale={scale} />
            <Text style={[styles.sosIconLabel, {
              top: 25 * scale,
              fontSize: 5 * scale,
              lineHeight: 6 * scale,
            }]}>SOS</Text>
          </View>
        ) : (
          <>
            <View style={[styles.tabIconCircle, focused && styles.tabIconCircleSelected, {
              width: (focused ? 32 : 36) * scale,
              height: (focused ? 20 : 15) * scale,
              borderRadius: 999,
            }]}>
              <NavigationIcon
                name={name as NavigationIconName}
                selected={focused}
                scale={scale}
              />
            </View>
            {!focused ? (
              <Text style={[styles.tabLabel, { fontSize: 6 * scale, lineHeight: 7 * scale }]}>
                {name}
              </Text>
            ) : null}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

function UserTabBar({ state, navigation }: BottomTabBarProps) {
  const { width, uiScale: scale, isWebDesktop } = useResponsiveLayout();

  if (state.routes[state.index]?.name === 'Rescue Status') return null;

  if (isWebDesktop) {
    return (
      <View style={styles.desktopNavShell}>
        <View style={styles.desktopNavBrand}>
          <Text style={styles.desktopNavBrandText}>CDRRMD</Text>
          <Text style={styles.desktopNavBrandSub}>RESIDENT PORTAL</Text>
        </View>
        <View style={styles.desktopNavItems}>
          {state.routes.filter((route) => route.name !== 'Rescue Status').map((route) => {
            const focused = state.routes[state.index]?.key === route.key;
            const isSos = route.name === 'SOS';
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    markNavigationStart(route.name);
                    navigation.navigate(route.name);
                  }
                }}
                style={[styles.desktopNavItem, focused && styles.desktopNavItemActive, isSos && styles.desktopNavItemSos]}
              >
                {isSos
                  ? <SosNavigationIcon selected={focused} scale={1.2} />
                  : <NavigationIcon name={route.name as NavigationIconName} selected={focused} scale={1.2} />}
                <Text style={[styles.desktopNavLabel, focused && styles.desktopNavLabelActive]}>{route.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tabBarShell, {
      width: Math.min(width - (14 * scale), 700),
      alignSelf: 'center',
      bottom: 26 * scale,
      height: 29 * scale,
      borderRadius: 14.5 * scale,
      shadowRadius: 3 * scale,
      shadowOffset: { width: 0, height: 2 * scale },
    }]}>
      {state.routes.filter((route) => route.name !== 'Rescue Status').map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        return (
          <NavigationTabButton
            key={route.key}
            name={route.name}
            focused={focused}
            scale={scale}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                markNavigationStart(route.name);
                navigation.navigate(route.name);
              }
            }}
          />
        );
      })}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <TypographyProvider>
        <AppContent />
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const RescueStatusScreen = require('./src/screens/RescueStatusScreen').default;
  const { uiScale, isWebDesktop } = useResponsiveLayout();
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [floodAlertRescueRequest, setFloodAlertRescueRequest] = useState<{ notificationId: number | null; requestedAt: number } | null>(null);
  const [locationChecking, setLocationChecking] = useState(false);
  const [locationGate, setLocationGate] = useState<{ message: string; activeSession: boolean } | null>(null);

  useEffect(() => {
    logRuntimeDiagnostics();
    return startJsStallMonitor();
  }, []);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const sessionRef = useRef<SessionData | null>(null);
  const locationGateRef = useRef(locationGate);
  const lastLocationRef = useRef<{ location: LiveLocation; checkedAt: number } | null>(null);
  const lastBarangaySyncRef = useRef(0);
  const monitorRunningRef = useRef(false);
  const lastLogoutAtRef = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    locationGateRef.current = locationGate;
  }, [locationGate]);

  useEffect(() => {
    registerSessionAuthorizationSetter(setApiAuthorizationToken);
  }, []);

  useEffect(() => {
    if (session?.user.role !== 'user') return undefined;
    const pushSessionScope = beginResidentPushNotificationSession();
    registerResidentPushNotifications(pushSessionScope).catch(() => {});
    const tokenSubscription = subscribeToPushTokenChanges(pushSessionScope);
    return () => tokenSubscription?.remove();
  }, [session?.user.id, session?.user.role]);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const storedTestMode = await loadTestMode();
      if (mounted) setTestModeEnabled(storedTestMode);
      const existing = await loadSession();
      const supportedRole = existing && ['user', 'rescuer', 'barangay_rescuer'].includes(existing.user?.role || '');
      if (!existing || !supportedRole) {
        await clearSession();
        if (mounted) setBooting(false);
        return;
      }

      let nextSession = existing;
      try {
        const response = await getAuthMe();
        if (response.data?.user?.id) {
          nextSession = { ...existing, user: { ...existing.user, ...response.data.user } };
        }
      } catch {
        nextSession = existing;
      }

      if (nextSession.user.role !== 'user') {
        await saveSession(nextSession);
        sessionRef.current = nextSession;
        setSession(nextSession);
        if (mounted) setBooting(false);
        return;
      }

      const ensured = await ensureAccountForSession(nextSession);
      await saveSession(ensured.session);
      sessionRef.current = ensured.session;

      if (storedTestMode) {
        setSession(ensured.session);
        setLocationGate(null);
      } else {
        await activateSession(ensured.session);
      }

      if (mounted) setBooting(false);
    }

    restoreSession().catch(() => {
      setBooting(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      handleAuthFailureIfSessionActive(sessionRef.current, performLogout);
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!session || session.user.role !== 'user' || testModeEnabled) {
      if (testModeEnabled) setLocationGate(null);
      return;
    }

    let mounted = true;

    async function monitorLocation() {
      if (AppState.currentState !== 'active' || monitorRunningRef.current) return;
      monitorRunningRef.current = true;
      try {
        const result = await requireLiveLocation(false);
        if (!mounted) return;

        if (!result.ok) {
          setLocationGate({ message: result.message, activeSession: true });
          return;
        }

        lastLocationRef.current = { location: result.location, checkedAt: Date.now() };
        const barangaySyncDue = Date.now() - lastBarangaySyncRef.current >= 30000;
        if (locationGateRef.current?.activeSession || barangaySyncDue) {
          await assignLocationToSession(result.location);
          if (mounted) setLocationGate(null);
        }
      } catch (error: any) {
        if (mounted) {
          setLocationGate({
            message: error?.response?.data?.message || error?.message || 'Location is unavailable. Turn it on, then select Try Again.',
            activeSession: true,
          });
        }
      } finally {
        monitorRunningRef.current = false;
      }
    }

    const interval = setInterval(monitorLocation, 30000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') monitorLocation();
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [session?.user.id, testModeEnabled]);

  async function assignLocationToSession(location: LiveLocation) {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    const response = await assignAuthBarangayFromLocation(location.latitude, location.longitude);
    // A resident request may finish after logout or after a responder signs in.
    // It must not update React state, storage, or the shared authorization header.
    if (sessionRef.current !== currentSession) return;
    const assignedUser = response.data?.user as SessionData['user'] | undefined;
    if (!assignedUser?.id || !assignedUser.barangayName) {
      throw new Error('The current activity barangay could not be determined.');
    }

    const nextSession: SessionData = {
      ...currentSession,
      user: { ...currentSession.user, ...assignedUser },
    };
    const ensured = await ensureAccountForSession(nextSession);
    if (sessionRef.current !== currentSession) return;
    const saved = await saveSession(ensured.session, () => sessionRef.current === currentSession);
    if (!saved || sessionRef.current !== currentSession) return;
    lastBarangaySyncRef.current = Date.now();
    sessionRef.current = ensured.session;
    setSession(ensured.session);
  }

  async function activateSession(candidate: SessionData, registrationProfile?: AppProfile) {
    setLocationChecking(true);
    let ensured = await ensureAccountForSession(candidate);
    await saveSession(ensured.session);
    sessionRef.current = ensured.session;
    setSession(ensured.session);
    if (testModeEnabled) {
      setLocationGate(null);
      setLocationChecking(false);
      return true;
    }
    setLocationGate({
      message: 'Location access is required. Turn on your live location to continue.',
      activeSession: false,
    });

    try {
      const result = await requireLiveLocation(true);
      if (!result.ok) {
        setLocationGate({ message: result.message, activeSession: false });
        return false;
      }

      lastLocationRef.current = { location: result.location, checkedAt: Date.now() };
      let hydratedSession: SessionData = ensured.session;
      try {
        hydratedSession = await syncMissingServerProfile(ensured.session, ensured.account.profile);
        ensured = await ensureAccountForSession(hydratedSession);
      } catch {
        ensured = await ensureAccountForSession(hydratedSession);
      }
      if (registrationProfile) {
        await patchAccountProfile(ensured.account.appUserId, registrationProfile);
      }

      const response = await assignAuthBarangayFromLocation(
        result.location.latitude,
        result.location.longitude,
      );
      const assignedUser = response.data?.user as SessionData['user'] | undefined;
      if (!assignedUser?.id || !assignedUser.barangayName) {
        throw new Error('The current activity barangay could not be determined.');
      }
      const assignedSession = {
        ...ensured.session,
        user: { ...ensured.session.user, ...assignedUser },
      };
      ensured = await ensureAccountForSession(assignedSession);
      lastBarangaySyncRef.current = Date.now();
      await saveSession(ensured.session);
      sessionRef.current = ensured.session;
      setSession(ensured.session);
      setLocationGate(null);
      return true;
    } catch (error: any) {
      setLocationGate({
        message: error?.response?.data?.message || error?.message || 'Unable to automatically assign your barangay. Select Try Again.',
        activeSession: true,
      });
      return false;
    } finally {
      setLocationChecking(false);
    }
  }

  async function handleAuthenticated(nextSession: SessionData, registrationProfile?: AppProfile) {
    if (nextSession.user.role === 'rescuer' || nextSession.user.role === 'barangay_rescuer') {
      const switchedAfterLogout = lastLogoutAtRef.current > 0;
      const marker = beginPerformanceStage(switchedAfterLogout
        ? 'rescuer-session-ready-after-logout'
        : 'rescuer-session-ready-direct');
      sessionRef.current = nextSession;
      setLocationGate(null);
      setSession(nextSession);
      endPerformanceStage(marker);
      // Persist after exposing the already-authenticated portal. The API token
      // was installed by postAuth, so this does not weaken request security.
      const persistenceMarker = beginPerformanceStage('rescuer-session-persistence');
      void saveSession(nextSession, () => sessionRef.current === nextSession)
        .then((saved) => endPerformanceStage(persistenceMarker, { success: saved }))
        .catch(() => endPerformanceStage(persistenceMarker, { success: false }));
      return;
    }
    if (nextSession.user.role !== 'user') {
      await clearSession();
      return;
    }

    // activateSession already normalizes and persists the account.
    await activateSession(nextSession, registrationProfile);
  }

  function performLogout() {
    const previousSession = sessionRef.current;
    const transitionMarker = beginPerformanceStage('logout-ui-transition');
    setLogoutBusy(true);
    sessionRef.current = null;
    lastLogoutAtRef.current = Date.now();
    setLocationGate(null);
    setSession(null);
    setAuthMode('login');
    setLogoutBusy(false);
    setLogoutConfirmationVisible(false);
    endPerformanceStage(transitionMarker);

    const cleanupMarker = beginPerformanceStage('logout-background-cleanup');
    const cleanupTasks: Promise<unknown>[] = [];
    if (previousSession?.token) {
      const serverMarker = beginPerformanceStage('logout-server-session-cleanup');
      cleanupTasks.push(logoutAuthSession(previousSession.token)
        .then(() => endPerformanceStage(serverMarker))
        .catch((error) => {
          endPerformanceStage(serverMarker, { success: false });
          throw error;
        }));
    }
    const storageMarker = beginPerformanceStage('logout-session-storage-cleanup');
    const storageCleanup = clearSession()
      .then(() => endPerformanceStage(storageMarker))
      .catch((error) => {
        endPerformanceStage(storageMarker, { success: false });
        throw error;
      });
    cleanupTasks.push(storageCleanup);
    if (previousSession?.user.role === 'user') {
      const pushMarker = beginPerformanceStage('logout-resident-push-cleanup');
      cleanupTasks.push(unregisterResidentPushNotifications(previousSession.token)
        .then(() => endPerformanceStage(pushMarker))
        .catch((error) => {
          endPerformanceStage(pushMarker, { success: false });
          throw error;
        }));
    }
    void Promise.allSettled(cleanupTasks).then((results) => {
      endPerformanceStage(cleanupMarker, {
        success: results.every((result) => result.status === 'fulfilled'),
      });
    });
  }

  function requestLogout() {
    setLogoutConfirmationVisible(true);
  }

  async function handleToggleTestMode() {
    const nextEnabled = !testModeEnabled;
    await saveTestMode(nextEnabled);
    setTestModeEnabled(nextEnabled);
    if (nextEnabled) {
      setLocationGate(null);
      return;
    }
    if (sessionRef.current) {
      await handleLocationRetry();
    }
  }

  function handleFloodAlertRescue(notificationId: number | null) {
    setFloodAlertRescueRequest({ notificationId, requestedAt: Date.now() });
    if (navigationRef.isReady()) navigationRef.navigate('SOS');
  }

  async function handleLocationRetry() {
    setLocationChecking(true);
    try {
      const result = await requireLiveLocation(true);
      if (!result.ok) {
        setLocationGate((current) => ({
          message: result.message,
          activeSession: current?.activeSession ?? Boolean(sessionRef.current),
        }));
        return;
      }

      lastLocationRef.current = { location: result.location, checkedAt: Date.now() };
      if (sessionRef.current) {
        await assignLocationToSession(result.location);
      }
      setLocationGate(null);
    } catch (error: any) {
      setLocationGate((current) => ({
        message: error?.response?.data?.message || error?.message || 'Unable to verify your location. Select Try Again.',
        activeSession: current?.activeSession ?? Boolean(sessionRef.current),
      }));
    } finally {
      setLocationChecking(false);
    }
  }

  if (booting) {
    return (
      <View style={styles.booting}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!session) {
    if (authMode === 'forgot-password') {
      return (
        <View style={styles.appRoot}>
          <ForgotPasswordScreen onShowLogin={() => setAuthMode('login')} />
        </View>
      );
    }

    if (authMode === 'register') {
      return (
        <View style={styles.appRoot}>
          <RegisterScreen
            onRegisterSuccess={handleAuthenticated}
            onShowLogin={() => setAuthMode('login')}
          />
        </View>
      );
    }

    return (
      <View style={styles.appRoot}>
        <LoginScreen
          onLoginSuccess={handleAuthenticated}
          onShowRegister={() => setAuthMode('register')}
          onForgotPassword={() => setAuthMode('forgot-password')}
        />
      </View>
    );
  }

  if (session.user.role === 'rescuer' || session.user.role === 'barangay_rescuer') {
    return (
      <View style={styles.appRoot}>
        <RescuerPortal
          role={session.user.role as ResponderRole}
          barangayName={session.user.barangayName}
          onLogout={requestLogout}
          onAuthError={() => {
            handleAuthFailureForSession(session, sessionRef.current, performLogout);
          }}
        />
        <LogoutConfirmationModal
          visible={logoutConfirmationVisible}
          responder
          loading={logoutBusy}
          onCancel={() => setLogoutConfirmationVisible(false)}
          onConfirm={() => void performLogout()}
        />
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={() => {
          const routeName = navigationRef.getCurrentRoute()?.name;
          if (routeName) markNavigationSettled(routeName);
        }}
      >
        <ResidentFloodAlert
          barangayName={session.user.barangayName ?? ''}
          onTestAccountRemoved={() => void performLogout()}
          onSendRescue={handleFloodAlertRescue}
        />
        <Tab.Navigator
        id="MainTabs"
        tabBar={(props) => <UserTabBar {...props} />}
        screenOptions={() => ({
          headerShown: false,
          sceneStyle: isWebDesktop ? styles.desktopScene : undefined,
        })}
      >
        <Tab.Screen name="Home">
          {() => <HomeScreen barangayName={session.user.barangayName ?? ''} />}
        </Tab.Screen>
        <Tab.Screen name="Weather" component={WeatherScreen} />
        <Tab.Screen name="SOS">
          {() => <RescueMapScreen testModeEnabled={testModeEnabled} floodAlertRescueRequest={floodAlertRescueRequest} />}
        </Tab.Screen>
        <Tab.Screen name="Family">
          {() => <FamilyScreen />}
        </Tab.Screen>
        <Tab.Screen name="Me">
          {() => <MeScreen appUserId={session.appUserId ?? ''} barangayName={session.user.barangayName} onLogout={requestLogout} />}
        </Tab.Screen>
        <Tab.Screen
          name="Rescue Status"
          component={RescueStatusScreen}
          options={{
            tabBarButton: () => null,
            tabBarItemStyle: { display: 'none' },
            tabBarLabel: () => null,
            tabBarStyle: { display: 'none' },
          }}
        />
        </Tab.Navigator>
      </NavigationContainer>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Service-area test mode is ${testModeEnabled ? 'on' : 'off'}`}
        activeOpacity={0.85}
        hitSlop={8}
        onPress={() => void handleToggleTestMode()}
        style={[styles.testModeButton, testModeEnabled && styles.testModeButtonEnabled, isWebDesktop && styles.desktopTestModeButton, {
          bottom: isWebDesktop ? undefined : 62 * uiScale,
          right: 8 * uiScale,
          paddingHorizontal: 5 * uiScale,
          paddingVertical: 2 * uiScale,
          borderRadius: 7 * uiScale,
        }]}
      >
        <Text style={[styles.testModeButtonText, { fontSize: 6 * uiScale }]}>
          TEST MODE: {testModeEnabled ? 'ON' : 'OFF'}
        </Text>
      </TouchableOpacity>

      {locationGate ? (
        <RequiredLocationModal
          loading={locationChecking}
          message={locationGate.message}
          activeSession
          onEnable={handleLocationRetry}
          testModeEnabled={testModeEnabled}
          onToggleTestMode={() => void handleToggleTestMode()}
        />
      ) : null}
      <LogoutConfirmationModal
        visible={logoutConfirmationVisible}
        loading={logoutBusy}
        onCancel={() => setLogoutConfirmationVisible(false)}
        onConfirm={() => void performLogout()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  testModeButton: {
    position: 'absolute',
    zIndex: 1000,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#ffffff',
    backgroundColor: '#64748b',
  },
  testModeButtonEnabled: {
    backgroundColor: '#dc2626',
  },
  testModeButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  tabBarShell: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  desktopNavShell: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 900,
    minHeight: 72,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#d9e4ec',
    shadowColor: '#0d3558',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  desktopNavBrand: { minWidth: 190 },
  desktopNavBrandText: { color: '#0d3558', fontSize: 20, lineHeight: 23, fontWeight: '900' },
  desktopNavBrandSub: { color: '#3777a8', fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 1.5 },
  desktopNavItems: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desktopNavItem: {
    minHeight: 44,
    minWidth: 94,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  desktopNavItemActive: { backgroundColor: '#e7f2fa' },
  desktopNavItemSos: { borderWidth: 1, borderColor: '#f2c7c7', backgroundColor: '#fff7f7' },
  desktopNavLabel: { color: '#36576d', fontSize: 14, fontWeight: '700' },
  desktopNavLabelActive: { color: '#0d3558', fontWeight: '900' },
  desktopScene: { paddingTop: 72 },
  desktopTestModeButton: { top: 82 },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabAnimatedContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabIconCircleSelected: { backgroundColor: '#3777A8' },
  tabLabel: { color: '#171717', fontFamily: 'Sora_400Regular', fontWeight: '400', textAlign: 'center', includeFontPadding: false },
  sosTabIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
  },
  sosIconLabel: {
    position: 'absolute',
    color: '#ffffff',
    fontFamily: 'Sora_800ExtraBold',
    fontWeight: '900',
  },
  booting: {
    flex: 1,
    backgroundColor: '#0d3558',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
