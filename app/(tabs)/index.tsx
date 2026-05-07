import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { getUserStats, UserStats } from '@/lib/stats';
import { useToast } from '@/components/Toast';
import ErrorState from '@/components/ErrorState';
import { getFriendlyError, FriendlyError } from '@/lib/errors';

export default function HomeScreen() {
  const { appUser, firebaseUser } = useAuth();
  const router = useRouter();
  const { showError } = useToast();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);
      const s = await getUserStats(firebaseUser.uid);
      setStats(s);
    } catch (e) {
      console.error(e);
      const friendly = getFriendlyError(e);
      if (!stats) {
        setError(friendly);
      } else {
        showError(e);
      }
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

  if (error) {
    return <ErrorState error={error} onRetry={load} fullPage />;
  }

  // Lowercase date matching web (pt-BR locale already handles this)
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
    >
      {/* Greeting */}
      <View>
        <Text style={styles.greetingText}>Olá, {appUser?.firstName ?? ''}! 👋</Text>
        <Text style={styles.dateText}>{today}</Text>
      </View>

      {/* Next Reservation */}
      {stats?.nextReservation && (
        <View style={styles.nextCard}>
          <View style={styles.nextCardHeader}>
            <Text style={styles.nextCardLabel}>PRÓXIMA RESERVA</Text>
            <Ionicons name="calendar" size={16} color="#10b981" />
          </View>
          <Text style={styles.nextCardDate}>{stats.nextReservation.dateLabel}</Text>
          <Text style={styles.nextCardTime}>{stats.nextReservation.time}</Text>
          {stats.nextReservation.participants.length > 0 && (
            <Text style={styles.nextCardParticipants} numberOfLines={1}>
              {stats.nextReservation.participants.join(', ')}
            </Text>
          )}
        </View>
      )}

      {/* Stats Grid */}
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
          <Text style={styles.statLabel}>Semanas{'\n'}consecutivas</Text>
        </View>
      </View>

      {/* Frequency by day */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="trending-up-outline" size={18} color="#10b981" />
          <Text style={styles.cardTitle}>Frequência por dia</Text>
        </View>
        <View style={styles.chart}>
          {(stats?.dayStats ?? []).map((stat) => (
            <View key={stat.day} style={styles.chartBar}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: stat.count > 0
                        ? Math.max(Math.round((stat.count / maxCount) * 120), 6)
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

      {/* Top Partners */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Parceiros mais frequentes</Text>
        {(stats?.topPartners?.length ?? 0) > 0 ? (
          <View style={styles.partnersList}>
            {stats!.topPartners.map((p) => (
              <TouchableOpacity
                key={p.userId}
                style={styles.partnerRow}
                onPress={() => router.push(`/perfil?userId=${p.userId}`)}
              >
                <View style={styles.partnerLeft}>
                  {p.pictureUrl ? (
                    <Image source={{ uri: p.pictureUrl }} style={styles.partnerAvatar} />
                  ) : (
                    <View style={[styles.partnerAvatar, styles.partnerAvatarFallback]}>
                      <Text style={styles.partnerInitials}>{p.initials}</Text>
                    </View>
                  )}
                  <Text style={styles.partnerName}>{p.name}</Text>
                </View>
                <Text style={styles.partnerCount}>
                  {p.count} {p.count === 1 ? 'jogo' : 'jogos'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Nenhum parceiro ainda. Faça reservas para aparecer aqui.
          </Text>
        )}
      </View>

      {/* CTA when no upcoming reservation */}
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

  greetingText: { fontSize: 24, fontWeight: '800', color: '#111827' },
  dateText: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  nextCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 20,
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
  nextCardTime: { fontSize: 14, color: '#374151', marginBottom: 4 },
  nextCardParticipants: { fontSize: 12, color: '#059669' },

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
  statLabel: { fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 15 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 16,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { height: 120, justifyContent: 'flex-end', width: '80%' },
  bar: { width: '100%', backgroundColor: '#10b981', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  barCount: { fontSize: 11, color: '#9ca3af' },

  partnersList: { gap: 10 },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  partnerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partnerAvatar: { width: 32, height: 32, borderRadius: 16 },
  partnerAvatarFallback: { backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  partnerInitials: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  partnerName: { fontSize: 14, fontWeight: '500', color: '#111827' },
  partnerCount: { fontSize: 12, color: '#6b7280' },

  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },

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
