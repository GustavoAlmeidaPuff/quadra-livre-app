import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Reservation } from '@/types';
import { useRouter } from 'expo-router';

function formatDate(d: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface ReservationItem {
  id: string;
  start: Date;
  end: Date;
  dateLabel: string;
  timeLabel: string;
  isPast: boolean;
}

export default function ReservarScreen() {
  const { firebaseUser } = useAuth();
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const q = query(
        collection(db, 'reservations'),
        where('createdById', '==', firebaseUser.uid)
      );
      const snap = await getDocs(q);
      const now = new Date();
      const items: ReservationItem[] = snap.docs
        .map((d) => {
          const data = d.data() as Reservation;
          const start = data.startAt.toDate();
          const end = data.endAt.toDate();
          return {
            id: d.id,
            start,
            end,
            dateLabel: formatDate(start),
            timeLabel: `${formatTime(start)} – ${formatTime(end)}`,
            isPast: end < now,
          };
        })
        .sort((a, b) => {
          if (tab === 'upcoming') return a.start.getTime() - b.start.getTime();
          return b.start.getTime() - a.start.getTime();
        });
      setReservations(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const displayed = reservations.filter((r) =>
    tab === 'upcoming' ? !r.isPast : r.isPast
  );

  return (
    <View style={styles.container}>
      {/* Tab toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'upcoming' && styles.tabBtnActive]}
          onPress={() => setTab('upcoming')}
        >
          <Text style={[styles.tabBtnText, tab === 'upcoming' && styles.tabBtnTextActive]}>
            Próximas
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'past' && styles.tabBtnActive]}
          onPress={() => setTab('past')}
        >
          <Text style={[styles.tabBtnText, tab === 'past' && styles.tabBtnTextActive]}>
            Histórico
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#10b981" size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
          }
        >
          {displayed.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>
                {tab === 'upcoming'
                  ? 'Nenhuma reserva futura.\nFaça uma nova reserva!'
                  : 'Nenhuma reserva anterior.'}
              </Text>
            </View>
          ) : (
            displayed.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardLeft}>
                  <View style={styles.dot} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardDate}>{item.dateLabel}</Text>
                  <Text style={styles.cardTime}>{item.timeLabel}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB to create new reservation */}
      <View style={styles.fabHint}>
        <Text style={styles.fabHintText}>
          Para criar reservas, acesse o app web ou aguarde a próxima versão do app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  tabBtnActive: { backgroundColor: '#10b981' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  tabBtnTextActive: { color: '#ffffff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardLeft: { alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
  },
  cardContent: { flex: 1 },
  cardDate: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardTime: { fontSize: 13, color: '#6b7280' },
  fabHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
    padding: 12,
  },
  fabHintText: { fontSize: 12, color: '#92400e', textAlign: 'center' },
});
