import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { Reservation } from '@/types';

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface NextReservation {
  id: string;
  dateLabel: string;
  time: string;
}

interface Stats {
  totalHours: number;
  totalReservations: number;
  weekStreak: number;
  dayStats: { day: string; count: number }[];
  nextReservation: NextReservation | null;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function loadStats(userId: string): Promise<Stats> {
  const now = new Date();
  const q = query(
    collection(db, 'reservations'),
    where('createdById', '==', userId)
  );
  const snap = await getDocs(q);
  const reservations = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Reservation));

  const past = reservations.filter((r) => r.endAt.toDate() < now);
  const upcoming = reservations
    .filter((r) => r.startAt.toDate() >= now)
    .sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());

  const totalHours = Math.round(
    past.reduce((acc, r) => {
      const mins = (r.endAt.toMillis() - r.startAt.toMillis()) / 60000;
      return acc + mins;
    }, 0) / 60
  );

  const dayStats = DAY_NAMES.map((day, i) => ({
    day,
    count: past.filter((r) => r.startAt.toDate().getDay() === i).length,
  }));

  const weekStart = (d: Date) => {
    const s = new Date(d);
    s.setDate(d.getDate() - d.getDay());
    s.setHours(0, 0, 0, 0);
    return s.getTime();
  };
  const pastWeeks = new Set(past.map((r) => weekStart(r.startAt.toDate())));
  let weekStreak = 0;
  const checkDate = new Date();
  checkDate.setDate(checkDate.getDate() - checkDate.getDay());
  checkDate.setHours(0, 0, 0, 0);
  while (pastWeeks.has(checkDate.getTime())) {
    weekStreak++;
    checkDate.setDate(checkDate.getDate() - 7);
  }

  let nextReservation: NextReservation | null = null;
  if (upcoming.length > 0) {
    const next = upcoming[0];
    const start = next.startAt.toDate();
    const end = next.endAt.toDate();
    const today = new Date();
    const isToday = start.toDateString() === today.toDateString();
    const isTomorrow =
      start.toDateString() ===
      new Date(today.getTime() + 86400000).toDateString();
    const dateLabel = isToday
      ? 'Hoje'
      : isTomorrow
      ? 'Amanhã'
      : start.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        });
    nextReservation = {
      id: next.id,
      dateLabel,
      time: `${formatTime(start)} – ${formatTime(end)}`,
    };
  }

  return { totalHours, totalReservations: past.length, weekStreak, dayStats, nextReservation };
}

export default function HomeScreen() {
  const { appUser, firebaseUser } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const s = await loadStats(firebaseUser.uid);
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const maxCount = Math.max(...(stats?.dayStats.map((d) => d.count) ?? [0]), 1);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>Olá, {appUser?.firstName ?? ''}! 👋</Text>
        <Text style={styles.dateText}>{today}</Text>
      </View>

      {stats?.nextReservation && (
        <View style={styles.nextCard}>
          <View style={styles.nextCardHeader}>
            <Text style={styles.nextCardLabel}>PRÓXIMA RESERVA</Text>
            <Ionicons name="calendar" size={16} color="#10b981" />
          </View>
          <Text style={styles.nextCardDate}>{stats.nextReservation.dateLabel}</Text>
          <Text style={styles.nextCardTime}>{stats.nextReservation.time}</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="time-outline" size={22} color="#10b981" />
          <Text style={styles.statNumber}>{stats?.totalHours ?? 0}h</Text>
          <Text style={styles.statLabel}>Total jogadas</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="calendar-outline" size={22} color="#10b981" />
          <Text style={styles.statNumber}>{stats?.totalReservations ?? 0}</Text>
          <Text style={styles.statLabel}>Reservas</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up-outline" size={22} color="#10b981" />
          <Text style={styles.statNumber}>{stats?.weekStreak ?? 0}</Text>
          <Text style={styles.statLabel}>Semanas</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Frequência por dia</Text>
        <View style={styles.chart}>
          {(stats?.dayStats ?? []).map((stat) => (
            <View key={stat.day} style={styles.chartBar}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: stat.count > 0
                        ? Math.max(Math.round((stat.count / maxCount) * 100), 6)
                        : 0,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{stat.day}</Text>
              <Text style={styles.barCount}>{stat.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {!stats?.nextReservation && (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/(tabs)/reservar')}
        >
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={styles.ctaText}>Fazer uma reserva</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting: { marginBottom: 4 },
  greetingText: { fontSize: 24, fontWeight: '800', color: '#111827' },
  dateText: { fontSize: 13, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },
  nextCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  nextCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nextCardLabel: { fontSize: 11, fontWeight: '700', color: '#065f46', letterSpacing: 0.5 },
  nextCardDate: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  nextCardTime: { fontSize: 14, color: '#374151' },
  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: { fontSize: 22, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6b7280', textAlign: 'center' },
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 16 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { height: 100, justifyContent: 'flex-end', width: '80%' },
  bar: { width: '100%', backgroundColor: '#10b981', borderRadius: 4 },
  barLabel: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  barCount: { fontSize: 11, color: '#9ca3af' },
  ctaButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
