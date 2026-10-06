import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  TemperatureArtwork,
  temperatureIconFromCelsius,
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
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    wind_speed_10m?: number[];
    weather_code?: number[];
    precipitation?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
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
  const timelineHourWidth = 30 * scale;
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedHour, setSelectedHour] = useState(0);

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
    const timer = setInterval(fetchWeather, 120_000);
    return () => clearInterval(timer);
  }, [fetchWeather]);

  const activeWeatherCode = data?.current?.weather_code ?? data?.hourly?.weather_code?.[0];
  const currentTemperature = data?.current?.temperature_2m;
  const visual = useMemo(() => getWeatherVisualByCode(activeWeatherCode), [activeWeatherCode]);

  const hourlyRows = useMemo(() => {
    const hourly = data?.hourly;
    return (hourly?.time ?? []).slice(0, 168).map((time, index) => ({
      time,
      temp: hourly?.temperature_2m?.[index],
      humidity: hourly?.relative_humidity_2m?.[index],
      wind: hourly?.wind_speed_10m?.[index],
      rain: hourly?.precipitation?.[index],
      code: hourly?.weather_code?.[index],
    }));
  }, [data?.hourly]);

  const dailyRows = useMemo(() => {
    const daily = data?.daily;
    return (daily?.time ?? []).slice(0, 7).map((day, index) => ({
      day,
      max: daily?.temperature_2m_max?.[index],
      min: daily?.temperature_2m_min?.[index],
      wind: daily?.wind_speed_10m_max?.[index],
      rain: daily?.precipitation_sum?.[index],
      code: daily?.weather_code?.[index],
    }));
  }, [data?.daily]);

  const selectedHourRow = hourlyRows[selectedHour] ?? hourlyRows[0];

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
        <View style={[st.hero, { minHeight: 126 * scale, paddingHorizontal: 13 * scale, paddingTop: 13 * scale }]}>
          <View style={st.heroCopy}>
            <Text style={[st.heroTitle, { fontSize: 10 * scale, lineHeight: 12 * scale }]}>Weather</Text>
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
              <View style={st.metric}>
                <View style={st.metricValue}>
                  <TemperatureArtwork name={temperatureIconFromCelsius(data.current.apparent_temperature)} scale={scale} />
                  <Text style={[st.metricText, { fontSize: 6 * scale }]}>Feels {data.current.apparent_temperature ?? '--'}°C</Text>
                </View>
                <MetricAccent type="temperature" scale={scale} />
              </View>
            </View>
          </View>
          <View style={[st.heroArtwork, { right: 19 * scale, top: 25 * scale }]}>
            <WeatherConditionArtwork name={weatherIconFromCode(activeWeatherCode)} scale={5 * scale} />
          </View>
        </View>

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
              <Text style={[st.sectionTitle, { fontSize: 10 * scale, marginTop: 9 * scale, marginBottom: 4 * scale }]}>7-Day Forecast Timeline</Text>
              <View style={[st.timelineCard, { marginHorizontal: 8 * scale, borderRadius: 8 * scale, paddingVertical: 8 * scale }]}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  scrollEventThrottle={64}
                  onScroll={(event) => {
                    const index = Math.round(event.nativeEvent.contentOffset.x / timelineHourWidth);
                    setSelectedHour(Math.max(0, Math.min(hourlyRows.length - 1, index)));
                  }}
                >
                  <View style={{ width: hourlyRows.length * timelineHourWidth }}>
                    <View style={st.timelineDays}>
                      {dailyRows.map((day) => (
                        <View key={day.day} style={{ width: 24 * timelineHourWidth, alignItems: 'center' }}>
                          <Text style={[st.timelineDay, { fontSize: 7 * scale }]}>{formatDay(day.day)}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={[st.timelineTicks, { height: 17 * scale, marginTop: 6 * scale }]}>
                      {hourlyRows.map((hour, index) => (
                        <View key={hour.time} style={[
                          st.timelineTick,
                          { width: timelineHourWidth, height: (index === selectedHour ? 17 : 9) * scale },
                          index === selectedHour && st.timelineSelectedTick,
                        ]} />
                      ))}
                    </View>
                  </View>
                </ScrollView>
                {selectedHourRow ? (
                  <View style={[st.timelineReading, { paddingHorizontal: 10 * scale, paddingTop: 5 * scale }]}>
                    <Text style={[st.timelineReadingTitle, { fontSize: 7 * scale }]}>
                      {formatDay(selectedHourRow.time)} · {formatHour(selectedHourRow.time)}
                    </Text>
                    <Text style={[st.timelineReadingDetail, { fontSize: 6 * scale, marginTop: 2 * scale }]}>
                      Wind {selectedHourRow.wind ?? '--'} km/h  ·  Rain {selectedHourRow.rain ?? '--'} mm
                    </Text>
                  </View>
                ) : null}
              </View>

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
                      <Text style={[st.hourTemp, { fontSize: 11 * scale, marginLeft: 4 * scale }]}>{hour.temp ?? '--'}°</Text>
                    </View>
                    <Text style={[st.hourText, { fontSize: 6 * scale, marginTop: 3 * scale }]} numberOfLines={1}>
                      {getWeatherVisualByCode(hour.code).condition}
                    </Text>
                    <Text style={[st.hourText, { fontSize: 5.5 * scale, marginTop: 4 * scale }]}>Humidity {hour.humidity ?? '--'}%</Text>
                    <Text style={[st.hourText, { fontSize: 5.5 * scale }]}>Wind {hour.wind ?? '--'} km/h</Text>
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
                  <Text style={[st.dayTemp, { fontSize: 8 * scale }]}>{day.max ?? '--'}° / {day.min ?? '--'}°</Text>
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
  heroCopy: { zIndex: 1, maxWidth: '68%' },
  heroTitle: { color: editorial.ink, includeFontPadding: false },
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
  timelineCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border, overflow: 'hidden' },
  timelineDays: { flexDirection: 'row' },
  timelineDay: { color: '#181818', fontWeight: '700' },
  timelineTicks: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  timelineTick: { borderLeftWidth: 1, borderLeftColor: '#b9c4ca' },
  timelineSelectedTick: { borderLeftWidth: 3, borderLeftColor: editorial.accent },
  timelineReading: { borderTopWidth: 1, borderTopColor: '#e5e5e5' },
  timelineReadingTitle: { color: '#181818', fontWeight: '700' },
  timelineReadingDetail: { color: '#585858' },
  hourCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border },
  hourTime: { color: '#585858' },
  hourCondition: { flexDirection: 'row', alignItems: 'center' },
  hourTemp: { color: '#181818', fontWeight: '800' },
  hourText: { color: '#585858' },
  dayCard: { backgroundColor: editorial.surface, borderWidth: 1, borderColor: editorial.border, flexDirection: 'row', alignItems: 'center' },
  dayCopy: { flex: 1, minWidth: 0 },
  dayTitle: { color: '#181818', fontWeight: '700' },
  dayDetail: { color: '#585858' },
  dayTemp: { color: '#181818', fontWeight: '700' },
});
