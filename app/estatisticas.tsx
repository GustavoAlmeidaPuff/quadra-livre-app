import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { getUserStats, UserStats } from '@/lib/stats';
import Avatar from '@/components/Avatar';

const CHART_MAX_HEIGHT = 120;

export default function EstatisticasScreen() {
  const { firebaseUser } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const viewedUserId = userId || firebaseUser?.uid || '';

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!viewedUserId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getUserStats(viewedUserId)
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [viewedUserId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Não foi possível carregar as estatísticas.</Text>
      </View>
    );
  }

  const dayStats = stats?.dayStats ?? [];
  const maxDayCount = Math.max(1, ...dayStats.map((d) => d.count));
  const monthlyHours = stats?.monthlyHours ?? [];
  const maxMonthlyHours = Math.max(1, ...monthlyHours.map((m) => m.hours));
  const weeklyHours = stats?.weeklyHours ?? [];
  const maxWeeklyHours = Math.max(1, ...weeklyHours.map((w) => w.hours));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Total de horas jogadas */}
      <View style={styles.card}>
        <View style={styles.totalIconWrap}>
          <Ionicons name="time-outline" size={26} color="#059669" />
        </View>
        <Text style={styles.totalLabel}>Total de horas jogadas</Text>
        <Text style={styles.totalValue}>
          {stats?.totalHours ?? 0}
          <Text style={styles.totalUnit}>h</Text>
        </Text>
      </View>

      {/* Frequência por dia */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="trending-up-outline" size={18} color="#059669" />
          <Text style={styles.cardTitle}>Frequência por dia</Text>
        </View>
        <View style={styles.chart}>
          {dayStats.map((stat) => (
            <View key={stat.day} style={styles.chartBar}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: stat.count > 0 ? Math.max(Math.round((stat.count / maxDayCount) * CHART_MAX_HEIGHT), 4) : 0,
                    },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{stat.day}</Text>
              <Text style={styles.barValue}>{stat.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Horas por mês */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="bar-chart-outline" size={18} color="#6b7280" />
          <Text style={styles.cardTitle}>Horas por mês</Text>
        </View>
        <View style={styles.chart}>
          {monthlyHours.map((m) => (
            <View key={m.monthKey} style={styles.chartBar}>
              <Text style={styles.barTopLabel}>{m.hours}h</Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    { height: m.hours > 0 ? Math.max(Math.round((m.hours / maxMonthlyHours) * CHART_MAX_HEIGHT), 4) : 0 },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{m.monthLabel}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Horas por semana */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="bar-chart-outline" size={18} color="#6b7280" />
          <Text style={styles.cardTitle}>Horas por semana</Text>
        </View>
        <View style={styles.chart}>
          {weeklyHours.map((w) => (
            <View key={w.weekKey} style={styles.chartBar}>
              <Text style={styles.barTopLabel}>{w.hours}h</Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    styles.barAlt,
                    { height: w.hours > 0 ? Math.max(Math.round((w.hours / maxWeeklyHours) * CHART_MAX_HEIGHT), 4) : 0 },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{w.weekLabel}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Com quem mais você jogou */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="people-outline" size={18} color="#6b7280" />
          <Text style={styles.cardTitle}>Com quem mais você jogou</Text>
        </View>
        {(stats?.topPartners.length ?? 0) === 0 ? (
          <Text style={styles.emptyText}>
            Ainda não há parceiros para exibir. Jogue mais partidas para ver o ranking.
          </Text>
        ) : (
          <View style={{ gap: 4 }}>
            {stats!.topPartners.map((partner, index) => (
              <TouchableOpacity
                key={partner.userId}
                style={styles.partnerRow}
                onPress={() => router.push({ pathname: '/perfil', params: { userId: partner.userId } })}
                activeOpacity={0.7}
              >
                <View style={styles.partnerRank}>
                  <Text style={styles.partnerRankText}>{index + 1}</Text>
                </View>
                <Avatar uri={partner.pictureUrl} initials={partner.initials} size={38} fontSize={14} />
                <Text style={styles.partnerName} numberOfLines={1}>{partner.name}</Text>
                <Text style={styles.partnerCount}>
                  {partner.count} {partner.count === 1 ? 'jogo' : 'jogos'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  errorText: { fontSize: 14, color: '#dc2626' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  totalIconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  totalLabel: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 4 },
  totalValue: { fontSize: 34, fontWeight: '800', color: '#111827', textAlign: 'center' },
  totalUnit: { fontSize: 20, fontWeight: '700', color: '#6b7280' },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { height: CHART_MAX_HEIGHT, justifyContent: 'flex-end', width: '78%' },
  bar: { width: '100%', backgroundColor: '#10b981', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barAlt: { backgroundColor: '#6ee7b7' },
  barLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  barValue: { fontSize: 10, color: '#9ca3af' },
  barTopLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },

  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },

  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  partnerRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerRankText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  partnerName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  partnerCount: { fontSize: 12, color: '#6b7280' },
});
