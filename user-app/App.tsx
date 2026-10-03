import { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Animated, Pressable, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
  getAuthMe,
  putAuthMe,
  setApiAuthorizationToken,
  setAuthFailureHandler,
} from './src/services/api';
import ResidentFloodAlert from './src/components/ResidentFloodAlert';
import RequiredLocationModal from './src/components/RequiredLocationModal';

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
  const { width } = useWindowDimensions();
  const scale = width / 216;

  if (state.routes[state.index]?.name === 'Rescue Status') return null;

  return (
    <View style={[styles.tabBarShell, {
      left: 7 * scale,
      right: 7 * scale,
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
  const { width: appWidth } = useWindowDimensions();
  const uiScale = Math.min(appWidth / 216, 1.82);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [session, setSession] = useState<SessionData | null>(null);
  const [testModeEnabled, setTestModeEnabled] = useState(false);

  useEffect(() => {
    registerSessionAuthorizationSetter(setApiAuthorizationToken);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      const existing = await loadSession();

      if (!mounted) {
        return;
      }

      if (existing?.user?.role === 'user') {
        let nextSession = existing;
        try {
          const meResponse = await getAuthMe();
          const serverUser = meResponse.data?.user;
          if (serverUser?.id) {
            nextSession = {
              ...existing,
              user: {
                ...existing.user,
                ...serverUser,
              },
            };
          }
        } catch {
          nextSession = existing;
        }

        let ensured = await ensureAccountForSession(nextSession);
        try {
          nextSession = await syncMissingServerProfile(ensured.session, ensured.account.profile);
          ensured = await ensureAccountForSession(nextSession);
        } catch {
          ensured = await ensureAccountForSession(nextSession);
        }

        await saveSession(ensured.session);
        setSession(ensured.session);
      } else {
        await clearSession();
      }

      setBooting(false);
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

  async function handleAuthenticated(nextSession: SessionData, registrationProfile?: AppProfile) {
    if (nextSession.user.role !== 'user') {
      await clearSession();
      return;
    }

    let hydratedSession = nextSession;
    try {
      const meResponse = await getAuthMe();
      const serverUser = meResponse.data?.user;
      if (serverUser?.id) {
        hydratedSession = {
          ...nextSession,
          user: {
            ...nextSession.user,
            ...serverUser,
          },
        };
      }
    } catch {
      hydratedSession = nextSession;
    }

    let ensured = await ensureAccountForSession(hydratedSession);
    try {
      hydratedSession = await syncMissingServerProfile(ensured.session, ensured.account.profile);
      ensured = await ensureAccountForSession(hydratedSession);
    } catch {
      ensured = await ensureAccountForSession(hydratedSession);
    }

    if (registrationProfile) {
      await patchAccountProfile(ensured.account.appUserId, registrationProfile);
    }
    await saveSession(ensured.session);
    setSession(ensured.session);
  }

  async function handleLogout() {
    await clearSession();
    setTestModeEnabled(false);
    setSession(null);
    setAuthMode('login');
  }

  async function handleLocationAssigned(user: SessionData['user']) {
    if (!session) return;

    const nextSession: SessionData = {
      ...session,
      user: { ...session.user, ...user },
    };
    const ensured = await ensureAccountForSession(nextSession);
    await saveSession(ensured.session);
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
        <RegisterScreen
          onRegisterSuccess={handleAuthenticated}
          onShowLogin={() => setAuthMode('login')}
        />
      );
    }

    return (
      <LoginScreen
        onLoginSuccess={handleAuthenticated}
        onShowRegister={() => setAuthMode('register')}
      />
    );
  }

  if (!session.user.barangayName) {
    return (
      <View style={styles.locationGate}>
        <RequiredLocationModal onAssigned={handleLocationAssigned} />
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
          {() => <MeScreen appUserId={session.appUserId ?? ''} onLogout={handleLogout} />}
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
  tabLabel: { color: '#171717', fontFamily: 'Manrope_400Regular', fontWeight: '400', textAlign: 'center', includeFontPadding: false },
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
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '900',
  },
  booting: {
    flex: 1,
    backgroundColor: '#0d3558',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationGate: {
    flex: 1,
    backgroundColor: '#eef3f6',
  },
});
