import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
import { getAuthMe, putAuthMe, setApiAuthorizationToken, setAuthFailureHandler } from './src/services/api';
import ResidentFloodAlert from './src/components/ResidentFloodAlert';

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

export default function App() {
  const RescueStatusScreen = require('./src/screens/RescueStatusScreen').default;
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [session, setSession] = useState<SessionData | null>(null);

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
    setSession(null);
    setAuthMode('login');
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

  return (
    <NavigationContainer>
      <ResidentFloodAlert onTestAccountRemoved={handleLogout} />
      <Tab.Navigator
        id="MainTabs"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0d3558',
            borderTopWidth: 0,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#ffffff',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
              Home: 'home-variant',
              Weather: 'weather-partly-cloudy',
              'Safe Zone': 'shield-check',
              Family: 'account-group',
              Me: 'account-circle',
            };
            return <MaterialCommunityIcons name={icons[route.name] ?? 'circle'} size={22} color={color} />;
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Weather" component={WeatherScreen} />
        <Tab.Screen name="Safe Zone" component={RescueMapScreen} />
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
  );
}

const styles = StyleSheet.create({
  booting: {
    flex: 1,
    backgroundColor: '#0d3558',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
