import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCityForecastWeather } from '../services/weatherService';
import { getWeatherVisualByCode } from '../utils/weatherVisual';

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
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    wind_speed_10m_max?: number[];
    precipitation_probability_max?: number[];
  };
};

export default function WeatherScreen() {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  async function fetchWeather() {
    setLoading(true);
    setHasError(false);
    try {
      const next = await getCityForecastWeather();
      setData(next ?? null);
    } catch {
      setData(null);
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWeather();
    const timer = setInterval(() => {
      fetchWeather();
    }, 120000);

    return () => clearInterval(timer);
  }, []);

  const activeWeatherCode = useMemo(() => {
    const currentCode = data?.current?.weather_code;
    if (Number.isFinite(currentCode)) {
      return currentCode;
    }

    const hourlyCode = data?.hourly?.weather_code?.[0];
    if (Number.isFinite(hourlyCode)) {
      return hourlyCode;
    }

    return undefined;
  }, [data?.current?.weather_code, data?.hourly?.weather_code]);

  const visual = useMemo(() => getWeatherVisualByCode(activeWeatherCode), [activeWeatherCode]);

  const hourlyRows = useMemo(() => {
    const t = data?.hourly?.time ?? [];
    const tmp = data?.hourly?.temperature_2m ?? [];
    const hum = data?.hourly?.relative_humidity_2m ?? [];
    const wnd = data?.hourly?.wind_speed_10m ?? [];
    const prc = data?.hourly?.precipitation_probability ?? [];
    const cds = data?.hourly?.weather_code ?? [];
    return t.slice(0, 48).map((time, i) => ({ time, temp: tmp[i], humidity: hum[i], wind: wnd[i], precip: prc[i], code: cds[i] }));
  }, [data?.hourly]);

  const dailyRows = useMemo(() => {
    const d = data?.daily?.time ?? [];
    const mx = data?.daily?.temperature_2m_max ?? [];
    const mn = data?.daily?.temperature_2m_min ?? [];
    const wn = data?.daily?.wind_speed_10m_max ?? [];
    const pr = data?.daily?.precipitation_probability_max ?? [];
    const cd = data?.daily?.weather_code ?? [];
    return d.map((day, i) => ({ day, max: mx[i], min: mn[i], wind: wn[i], precip: pr[i], code: cd[i] }));
  }, [data?.daily]);

  const fmtHour = (v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (v: string) => new Date(v).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#0d3558" />
      </View>
    );
  }

  if (hasError || !data?.current) {
    return (
      <View style={st.center}>
        <MaterialCommunityIcons name="weather-cloudy-alert" size={44} color="#0d3558" />
        <Text style={st.errTitle}>Weather unavailable</Text>
        <Text style={st.errBody}>Could not load the forecast. Try again later.</Text>
      </View>
    );
  }

  return (
    <View style={st.root}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Weather</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Hero */}
        <ImageBackground source={{ uri: visual.backgroundUri }} resizeMode="cover" style={st.hero} imageStyle={{ borderRadius: 16 }}>
          <View style={st.heroOverlay}>
            <Text style={st.heroLocation}>Calamba City, Laguna</Text>
            <Text style={st.heroTemp}>{data.current.temperature_2m ?? '--'}°C</Text>
            <Text style={st.heroCondition}>{visual.condition}</Text>
            <Text style={st.heroFeels}>Feels like {data.current.apparent_temperature ?? '--'}°C</Text>
          </View>
        </ImageBackground>

        {/* Stats */}
        <View style={st.statsRow}>
          <View style={st.statItem}>
            <MaterialCommunityIcons name="water-percent" size={20} color="#0d3558" />
            <Text style={st.statLabel}>Humidity</Text>
            <Text style={st.statValue}>{data.current.relative_humidity_2m ?? '--'}%</Text>
          </View>
          <View style={st.statItem}>
            <MaterialCommunityIcons name="weather-partly-cloudy" size={20} color="#0d3558" />
            <Text style={st.statLabel}>Wind</Text>
            <Text style={st.statValue}>{data.current.wind_speed_10m ?? '--'} km/h</Text>
          </View>
          <View style={st.statItem}>
            <MaterialCommunityIcons name="clock-outline" size={20} color="#0d3558" />
            <Text style={st.statLabel}>Updated</Text>
            <Text style={st.statValue}>{data.current.time ? fmtHour(data.current.time) : '--'}</Text>
          </View>
        </View>

        {/* Hourly */}
        <Text style={st.sectionTitle}>Hourly Forecast (48 h)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          {hourlyRows.map((h) => {
            const hv = getWeatherVisualByCode(h.code);
            return (
              <View key={h.time} style={st.hourCard}>
                <Text style={st.hourTime}>{fmtHour(h.time)}</Text>
                <Text style={st.hourTemp}>{h.temp ?? '--'}°</Text>
                <Text style={st.hourCond} numberOfLines={1}>{hv.condition}</Text>
                <Text style={st.hourMeta}>💧 {h.humidity ?? '--'}%</Text>
                <Text style={st.hourMeta}>🌧 {h.precip ?? '--'}%</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Daily */}
        <Text style={[st.sectionTitle, { marginTop: 6 }]}>Next Days</Text>
        <View style={{ paddingHorizontal: 14 }}>
          {dailyRows.map((d) => {
            const dv = getWeatherVisualByCode(d.code);
            return (
              <View key={d.day} style={st.dayCard}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={st.dayLabel}>{fmtDay(d.day)}</Text>
                  <Text style={st.dayCond}>{dv.condition}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.dayTemps}>{d.max ?? '--'}° / {d.min ?? '--'}°</Text>
                  <Text style={st.dayMeta}>Wind {d.wind ?? '--'} km/h</Text>
                  <Text style={st.dayMeta}>Rain {d.precip ?? '--'}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2f7', paddingHorizontal: 24 },
  errTitle: { color: '#0d3558', fontSize: 18, fontWeight: '800', marginTop: 12 },
  errBody: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 6 },

  header: {
    backgroundColor: '#0d3558', paddingTop: 48, paddingBottom: 14, paddingHorizontal: 16,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },

  hero: { margin: 14, borderRadius: 16, overflow: 'hidden' },
  heroOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)', padding: 20, minHeight: 180, justifyContent: 'flex-end', borderRadius: 16,
  },
  heroLocation: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  heroTemp: { color: '#fff', fontSize: 42, fontWeight: '900', marginTop: 4 },
  heroCondition: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  heroFeels: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },

  statsRow: {
    flexDirection: 'row', marginHorizontal: 14, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, justifyContent: 'space-between', marginBottom: 10,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statLabel: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  statValue: { color: '#0d3558', fontSize: 15, fontWeight: '800', marginTop: 2 },

  sectionTitle: { color: '#0d3558', fontSize: 18, fontWeight: '800', paddingHorizontal: 14, marginBottom: 10, marginTop: 4 },

  hourCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 10, marginRight: 10, width: 110,
  },
  hourTime: { color: '#94a3b8', fontSize: 11 },
  hourTemp: { color: '#0d3558', fontSize: 18, fontWeight: '800', marginTop: 2 },
  hourCond: { color: '#475569', fontSize: 11, marginTop: 2 },
  hourMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  dayCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dayLabel: { color: '#0d3558', fontSize: 14, fontWeight: '800' },
  dayCond: { color: '#475569', fontSize: 12, marginTop: 2 },
  dayTemps: { color: '#0d3558', fontSize: 14, fontWeight: '800' },
  dayMeta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
});
