import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  ImageBackground,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppText as Text } from '../components/Typography';
import { editorial } from '../components/EditorialTheme';
import { DashboardHeader } from '../components/DashboardHeader';
import {
  MetricAccent,
  WeatherConditionArtwork,
  weatherAdvice,
  weatherIconFromCode,
} from '../components/WeatherMetricArtwork';
import { getCityForecastWeather } from '../services/weatherService';
import { getWeatherVisualByCode } from '../utils/weatherVisual';
import { useResponsiveLayout } from '../utils/responsive';
import { keepIfEqual } from '../utils/stableData';

type WeatherResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    wind_speed_10m?: number[];
    weather_code?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    wind_speed_10m_max?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
  };
};

function formatHour(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WeatherScreen() {
  const { uiScale: scale, horizontalPadding } = useResponsiveLayout();
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchWeather = useCallback(async () => {
    try {
      const next = await getCityForecastWeather();
      if (next) setData((current) => keepIfEqual(current, next));
      setHasError(!next?.current);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') fetchWeather();
    }, 120_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchWeather();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [fetchWeather]);

  const activeWeatherCode = data?.current?.weather_code ?? data?.hourly?.weather_code?.[0];
  const currentTemperature = data?.current?.temperature_2m;
  const visual = useMemo(() => getWeatherVisualByCode(activeWeatherCode), [activeWeatherCode]);

  const hourlyRows = useMemo(() => {
    const hourly = data?.hourly;
    return (hourly?.time ?? []).slice(0, 168).map((time, index) => ({
      time,
      wind: hourly?.wind_speed_10m?.[index],
      rain: hourly?.precipitation?.[index],
      code: hourly?.weather_code?.[index],
    }));
  }, [data?.hourly]);

  const dailyRows = useMemo(() => {
    const daily = data?.daily;
    return (daily?.time ?? []).slice(0, 7).map((day, index) => ({
      day,
      wind: daily?.wind_speed_10m_max?.[index],
      rain: daily?.precipitation_sum?.[index],
      code: daily?.weather_code?.[index],
    }));
  }, [data?.daily]);

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#3777a8" />
      </View>
    );
  }

  if (hasError && !data?.current) {
    return (
      <View style={st.center}>
        <WeatherConditionArtwork name="cloudy" scale={3} />
        <Text style={st.errorTitle}>Weather unavailable</Text>
        <Text style={st.errorBody}>Could not load the forecast. Try again later.</Text>
      </View>
    );
  }

  if (!data?.current) return null;

  return (
    <View style={st.root}>
      <DashboardHeader />

      <ScrollView contentContainerStyle={[st.scrollContent, { paddingHorizontal: horizontalPadding }]}>
        <ImageBackground
          source={visual.backgroundSource}
          resizeMode="cover"
          style={[st.hero, { minHeight: 126 * scale, paddingHorizontal: 13 * scale, paddingTop: 13 * scale }]}
          imageStyle={st.heroBackgroundImage}
        >
          <View pointerEvents="none" style={st.heroScrim} />
          <View style={st.heroCopy}>
            <Text style={[st.heroTitle, { fontSize: 12 * scale, lineHeight: 14 * scale }]}>Weather</Text>
            <Text style={[st.heroLocation, { fontSize: 7 * scale, marginTop: 2 * scale }]}>Calamba City, Laguna</Text>
            <Text style={[st.heroTemp, { fontSize: 27 * scale, lineHeight: 32 * scale, marginTop: 7 * scale }]}>
              {currentTemperature ?? '--'}°C
            </Text>
            <View style={[st.metricRow, { marginTop: 3 * scale }]}>
              <View style={st.metric}>
                <View style={st.metricValue}>
                  <WeatherConditionArtwork name={weatherIconFromCode(activeWeatherCode)} scale={scale} />
                  <Text style={[st.metricText, { fontSize: 6 * scale }]}>{visual.condition}</Text>
                </View>
                <MetricAccent type="weather" scale={scale} />
              </View>
            </View>
          </View>
          <View style={[st.heroArtwork, { right: 19 * scale, top: 25 * scale }]}>
            <WeatherConditionArtwork name={weatherIconFromCode(activeWeatherCode)} scale={5 * scale} />
          </View>
        </ImageBackground>

        <View style={[st.contentPanel, {
          paddingBottom: 72 * scale,
        }]}>
          <Text style={[st.sectionTitle, { fontSize: 10 * scale, marginTop: 6 * scale, marginBottom: 4 * scale }]}>Current Conditions</Text>
          <View style={[st.adviceCard, { marginHorizontal: 8 * scale, padding: 10 * scale, borderRadius: 8 * scale }]}>
            <Text style={[st.adviceText, { fontSize: 7 * scale, lineHeight: 10 * scale }]}>
              {weatherAdvice(activeWeatherCode, currentTemperature)}
            </Text>
          </View>

          <View style={[st.statsRow, { marginHorizontal: 8 * scale, marginTop: 6 * scale, gap: 5 * scale }]}>
            <View style={[st.statCard, { paddingVertical: 8 * scale, borderRadius: 8 * scale }]}>
              <MaterialCommunityIcons name="water-percent" size={14 * scale} color={editorial.accent} />
              <Text style={[st.statLabel, { fontSize: 6 * scale, marginTop: 3 * scale }]}>Humidity</Text>
              <Text style={[st.statValue, { fontSize: 8 * scale }]}>{data.current.relative_humidity_2m ?? '--'}%</Text>
            </View>
            <View style={[st.statCard, { paddingVertical: 8 * scale, borderRadius: 8 * scale }]}>
              <MaterialCommunityIcons name="weather-windy" size={14 * scale} color={editorial.accent} />
              <Text style={[st.statLabel, { fontSize: 6 * scale, marginTop: 3 * scale }]}>Wind</Text>
              <Text style={[st.statValue, { fontSize: 8 * scale }]}>{data.current.wind_speed_10m ?? '--'} km/h</Text>
            </View>
            <View style={[st.statCard, { paddingVertical: 8 * scale, borderRadius: 8 * scale }]}>
              <MaterialCommunityIcons name="clock-outline" size={14 * scale} color={editorial.accent} />
              <Text style={[st.statLabel, { fontSize: 6 * scale, marginTop: 3 * scale }]}>Updated</Text>
              <Text style={[st.statValue, { fontSize: 8 * scale }]} numberOfLines={1}>
                {data.current.time ? formatHour(data.current.time) : '--'}
              </Text>
            </View>
          </View>

          {hourlyRows.length > 0 ? (
            <>
              <Text style={[st.sectionTitle, { fontSize: 10 * scale, marginTop: 9 * scale, marginBottom: 4 * scale }]}>Hourly Wind and Rain</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 * scale }}>
                {hourlyRows.map((hour) => (
                  <View key={hour.time} style={[st.hourCard, {
                    width: 68 * scale,
                    padding: 8 * scale,
                    marginRight: 5 * scale,
                    borderRadius: 8 * scale,
                  }]}>
                    <Text style={[st.hourTime, { fontSize: 6 * scale }]}>{formatHour(hour.time)}</Text>
                    <View style={[st.hourCondition, { marginTop: 4 * scale }]}>
                      <WeatherConditionArtwork name={weatherIconFromCode(hour.code)} scale={1.3 * scale} />
                    </View>
                    <Text style={[st.hourText, { fontSize: 6 * scale, marginTop: 3 * scale }]} numberOfLines={1}>
                      {getWeatherVisualByCode(hour.code).condition}
                    </Text>
                    <Text style={[st.hourText, { fontSize: 5.5 * scale, marginTop: 4 * scale }]}>Wind {hour.wind ?? '--'} km/h</Text>
                    <Text style={[st.hourText, { fontSize: 5.5 * scale }]}>Rain {hour.rain ?? '--'} mm</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}

          {dailyRows.length > 0 ? (
            <>
              <Text style={[st.sectionTitle, { fontSize: 10 * scale, marginTop: 9 * scale, marginBottom: 4 * scale }]}>7-Day Forecast</Text>
              {dailyRows.map((day) => (
                <View key={day.day} style={[st.dayCard, {
                  marginHorizontal: 8 * scale,
                  marginBottom: 5 * scale,
                  minHeight: 36 * scale,
                  paddingHorizontal: 9 * scale,
                  paddingVertical: 5 * scale,
                  borderRadius: 8 * scale,
                }]}>
                  <WeatherConditionArtwork name={weatherIconFromCode(day.code)} scale={1.35 * scale} />
                  <View style={[st.dayCopy, { marginLeft: 7 * scale }]}>
                    <Text style={[st.dayTitle, { fontSize: 8 * scale }]}>{formatDay(day.day)}</Text>
                    <Text style={[st.dayDetail, { fontSize: 6 * scale }]} numberOfLines={1}>
                      {getWeatherVisualByCode(day.code).condition} · Wind {day.wind ?? '--'} km/h · Rain {day.rain ?? '--'} mm
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: editorial.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: editorial.background, paddingHorizontal: 24 },
  errorTitle: { color: '#181818', fontSize: 18, fontWeight: '800', marginTop: 12 },
  errorBody: { color: '#585858', fontSize: 14, textAlign: 'center', marginTop: 6 },
  scrollContent: { flexGrow: 1, width: '100%', backgroundColor: editorial.background },
  hero: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: editorial.surface, flexDirection: 'row', marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  heroBackgroundImage: { opacity: 0.48 },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.42)' },
  heroCopy: { zIndex: 1, maxWidth: '68%' },
  heroTitle: { color: editorial.ink, fontWeight: '800', includeFontPadding: false },
  heroLocation: { color: editorial.muted, fontWeight: '700', includeFontPadding: false },
  heroTemp: { color: editorial.ink, fontWeight: '700', includeFontPadding: false },
  heroArtwork: { position: 'absolute', opacity: 0.9 },
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: { alignItems: 'flex-start' },
  metricValue: { flexDirection: 'row', alignItems: 'center', minHeight: 18 },
  metricText: { color: editorial.muted, marginLeft: 3, fontWeight: '600' },
  contentPanel: { flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: editorial.background },
  sectionTitle: { color: editorial.ink, fontWeight: '400', paddingHorizontal: 11 },
  adviceCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  adviceText: { color: editorial.muted },
  statsRow: { flexDirection: 'row' },
  statCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border, flex: 1, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: '#585858' },
  statValue: { color: '#181818', fontWeight: '700' },
  hourCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  hourTime: { color: '#585858' },
  hourCondition: { flexDirection: 'row', alignItems: 'center' },
  hourText: { color: '#585858' },
  dayCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border, flexDirection: 'row', alignItems: 'center' },
  dayCopy: { flex: 1, minWidth: 0 },
  dayTitle: { color: '#181818', fontWeight: '700' },
  dayDetail: { color: '#585858' },
});
