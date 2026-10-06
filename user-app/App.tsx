import { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Animated, AppState, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  putAuthMe,
  setApiAuthorizationToken,
  setAuthFailureHandler,
} from './src/services/api';
import ResidentFloodAlert from './src/components/ResidentFloodAlert';
import RequiredLocationModal from './src/components/RequiredLocationModal';
import AccountVerificationModal from './src/components/AccountVerificationModal';
import { DashboardHeader } from './src/components/DashboardHeader';
import { useResponsiveLayout } from './src/utils/responsive';
import { LiveLocation, requireLiveLocation } from './src/services/locationAccess';

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
              width: 36 * scale,
              height: (focused ? 25 : 15) * scale,
              borderRadius: 12.5 * scale,
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
  const { width, uiScale: scale } = useResponsiveLayout();

  if (state.routes[state.index]?.name === 'Rescue Status') return null;

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
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
          />
        );
      })}
    </View>
  );
}

export default function App() {
  return (
    <TypographyProvider>
      <AppContent />
    </TypographyProvider>
  );
}

function AppContent() {
  const RescueStatusScreen = require('./src/screens/RescueStatusScreen').default;
  const { uiScale } = useResponsiveLayout();
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [locationChecking, setLocationChecking] = useState(false);
  const [locationGate, setLocationGate] = useState<{ message: string; activeSession: boolean } | null>(null);
  const sessionRef = useRef<SessionData | null>(null);
  const locationGateRef = useRef(locationGate);
  const lastLocationRef = useRef<{ location: LiveLocation; checkedAt: number } | null>(null);
  const lastBarangaySyncRef = useRef(0);
  const monitorRunningRef = useRef(false);

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
    let mounted = true;

    async function restoreSession() {
      const existing = await loadSession();
      if (!existing || existing.user?.role !== 'user') {
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

      const ensured = await ensureAccountForSession(nextSession);
      await saveSession(ensured.session);
      sessionRef.current = ensured.session;

      if (String(ensured.session.user.verificationStatus || 'approved') === 'approved') {
        await activateApprovedSession(ensured.session);
      } else if (mounted) {
        setLocationGate(null);
        setSession(ensured.session);
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
      setSession(null);
      setAuthMode('login');
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let mounted = true;
    let checking = false;

    async function refreshVerificationStatus() {
      if (checking) return;
      checking = true;
      try {
        const response = await getAuthMe();
        const serverUser = response.data?.user as SessionData['user'] | undefined;
        if (!mounted || !serverUser?.id) return;

        const current = sessionRef.current;
        if (!current) return;
        const previousStatus = String(current.user.verificationStatus || 'approved');
        const nextSession: SessionData = {
          ...current,
          user: { ...current.user, ...serverUser },
        };
        const nextStatus = String(nextSession.user.verificationStatus || 'approved');

        if (previousStatus !== 'approved' && nextStatus === 'approved') {
          await activateApprovedSession(nextSession);
          return;
        }

        if (previousStatus !== nextStatus) {
          const ensured = await ensureAccountForSession(nextSession);
          await saveSession(ensured.session);
          sessionRef.current = ensured.session;
          setLocationGate(null);
          setSession(ensured.session);
        }
      } catch {
        // Keep the blocking verification state visible during temporary network failures.
      } finally {
        checking = false;
      }
    }

    const interval = setInterval(refreshVerificationStatus, 10000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshVerificationStatus();
    });
    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session || String(session.user.verificationStatus || 'approved') !== 'approved') return;

    let mounted = true;

    async function monitorLocation() {
      if (monitorRunningRef.current) return;
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

    const interval = setInterval(monitorLocation, 10000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') monitorLocation();
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [session?.user.id]);

  async function assignLocationToSession(location: LiveLocation) {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    const response = await assignAuthBarangayFromLocation(location.latitude, location.longitude);
    const assignedUser = response.data?.user as SessionData['user'] | undefined;
    if (!assignedUser?.id || !assignedUser.barangayName) {
      throw new Error('The nearest barangay could not be assigned.');
    }

    const nextSession: SessionData = {
      ...currentSession,
      user: { ...currentSession.user, ...assignedUser },
    };
    const ensured = await ensureAccountForSession(nextSession);
    await saveSession(ensured.session);
    lastBarangaySyncRef.current = Date.now();
    sessionRef.current = ensured.session;
    setSession(ensured.session);
  }

  async function activateApprovedSession(candidate: SessionData, registrationProfile?: AppProfile) {
    setLocationChecking(true);
    let ensured = await ensureAccountForSession(candidate);
    await saveSession(ensured.session);
    sessionRef.current = ensured.session;
    setSession(ensured.session);
    setLocationGate({
      message: 'Location access is required after account approval. Turn on your live location to continue.',
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
        throw new Error('The nearest barangay could not be assigned.');
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
    if (nextSession.user.role !== 'user') {
      await clearSession();
      return;
    }

    const ensured = await ensureAccountForSession(nextSession);
    if (String(ensured.session.user.verificationStatus || 'approved') === 'approved') {
      await activateApprovedSession(ensured.session, registrationProfile);
      return;
    }

    await saveSession(ensured.session);
    sessionRef.current = ensured.session;
    setLocationGate(null);
    setSession(ensured.session);
  }

  async function handleLogout() {
    await clearSession();
    setTestModeEnabled(false);
    setLocationGate(null);
    setSession(null);
    setAuthMode('login');
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

  async function handleVerificationResubmitted(user: SessionData['user']) {
    const current = sessionRef.current;
    if (!current) return;
    const nextSession: SessionData = {
      ...current,
      user: { ...current.user, ...user, verificationStatus: 'pending' },
    };
    const ensured = await ensureAccountForSession(nextSession);
    await saveSession(ensured.session);
    sessionRef.current = ensured.session;
    setLocationGate(null);
    setSession(ensured.session);
  }

  if (booting) {
    return (
      <View style={styles.booting}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!session) {
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
        />
      </View>
    );
  }

  const verificationStatus = String(session.user.verificationStatus || 'approved');
  if (verificationStatus === 'pending' || verificationStatus === 'disapproved') {
    return (
      <View style={styles.appRoot}>
        <DashboardHeader />
        <View style={styles.blockedDashboard}>
          <View style={styles.blockedDashboardCard}>
            <MaterialCommunityIcons name="view-dashboard-outline" size={42} color="#8aa0b4" />
            <Text style={styles.blockedDashboardTitle}>Resident Dashboard</Text>
            <Text style={styles.blockedDashboardText}>Account access is temporarily locked while verification is being completed.</Text>
          </View>
        </View>
        <AccountVerificationModal
          status={verificationStatus}
          onLogout={handleLogout}
          onResubmitted={handleVerificationResubmitted}
        />
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      <NavigationContainer>
        <ResidentFloodAlert onTestAccountRemoved={handleLogout} />
        <Tab.Navigator
        id="MainTabs"
        tabBar={(props) => <UserTabBar {...props} />}
        screenOptions={() => ({
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home">
          {() => <HomeScreen barangayName={session.user.barangayName ?? ''} />}
        </Tab.Screen>
        <Tab.Screen name="Weather" component={WeatherScreen} />
        <Tab.Screen name="SOS">
          {() => <RescueMapScreen testModeEnabled={testModeEnabled} />}
        </Tab.Screen>
        <Tab.Screen name="Family">
          {() => <FamilyScreen appUserId={session.appUserId ?? ''} />}
        </Tab.Screen>
        <Tab.Screen name="Me">
          {() => <MeScreen appUserId={session.appUserId ?? ''} barangayName={session.user.barangayName} onLogout={handleLogout} />}
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
        accessibilityLabel={`Temporary service-area test mode is ${testModeEnabled ? 'on' : 'off'}`}
        activeOpacity={0.85}
        hitSlop={8}
        onPress={() => setTestModeEnabled((current) => !current)}
        style={[styles.testModeButton, testModeEnabled && styles.testModeButtonEnabled, {
          bottom: 62 * uiScale,
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
        />
      ) : null}
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
  blockedDashboard: {
    flex: 1,
    backgroundColor: '#eef3f6',
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedDashboardCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7e0e7',
    backgroundColor: '#ffffff',
    padding: 28,
    alignItems: 'center',
  },
  blockedDashboardTitle: { color: '#1f3347', fontSize: 20, fontWeight: '800', marginTop: 12 },
  blockedDashboardText: { color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
});
