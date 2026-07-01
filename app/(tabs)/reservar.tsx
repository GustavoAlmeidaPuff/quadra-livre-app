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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Reservation, ReservationParticipant } from '@/types';
import { useToast } from '@/components/Toast';
import ErrorState from '@/components/ErrorState';
import { getFriendlyError, FriendlyError } from '@/lib/errors';

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
  isCreator: boolean;
  participants: string[];
  participantCount: number;
}

function ReservationDetailModal({
  item,
  visible,
  onClose,
  onCancel,
  onLeave,
  busy,
}: {
  item: ReservationItem | null;
  visible: boolean;
  onClose: () => void;
  onCancel: (id: string) => void;
  onLeave: (id: string) => void;
  busy: boolean;
}) {
  if (!item) return null;
  const hasMultiple = item.participantCount > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Detalhes da reserva</Text>
            <TouchableOpacity onPress={onClose} disabled={busy}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalRow}>
            <Ionicons name="calendar-outline" size={16} color="#10b981" />
            <Text style={styles.modalText}>{item.dateLabel}</Text>
          </View>
          <View style={styles.modalRow}>
            <Ionicons name="time-outline" size={16} color="#10b981" />
            <Text style={styles.modalText}>{item.timeLabel}</Text>
          </View>
          {item.participants.length > 0 && (
            <View style={styles.modalRow}>
              <Ionicons name="people-outline" size={16} color="#10b981" />
              <Text style={styles.modalText}>{item.participants.join(', ')}</Text>
            </View>
          )}

          {!item.isPast && (
            <View style={styles.modalActions}>
              {hasMultiple && !item.isCreator && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.leaveBtn, busy && styles.disabledBtn]}
                  onPress={() => onLeave(item.id)}
                  disabled={busy}
                >
                  <Ionicons name="log-out-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {busy ? 'Aguarde...' : 'Sair da reserva'}
                  </Text>
                </TouchableOpacity>
              )}
              {item.isCreator && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn, busy && styles.disabledBtn]}
                  onPress={() => onCancel(item.id)}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {busy ? 'Aguarde...' : 'Cancelar reserva'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function ReservarScreen() {
  const { firebaseUser } = useAuth();
  const { showError } = useToast();
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [selected, setSelected] = useState<ReservationItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);

      // Fetch all reservations where the user is a participant
      const participantsSnap = await getDocs(
        query(
          collection(db, 'reservationParticipants'),
          where('userId', '==', firebaseUser.uid)
        )
      );

      const reservationIds = [...new Set(participantsSnap.docs.map((d) => d.data().reservationId as string))];

      if (reservationIds.length === 0) {
        setReservations([]);
        return;
      }

      // Fetch reservation docs and participant names in parallel
      const reservationDocs = await Promise.all(
        reservationIds.map((id) => getDoc(doc(db, 'reservations', id)))
      );

      const now = new Date();
      const items: ReservationItem[] = [];

      for (const resDoc of reservationDocs) {
        if (!resDoc.exists()) continue;
        const data = resDoc.data() as Reservation;
        const start = data.startAt.toDate();
        const end = data.endAt.toDate();

        // Fetch participants for this reservation to get their names
        const partSnap = await getDocs(
          query(
            collection(db, 'reservationParticipants'),
            where('reservationId', '==', resDoc.id)
          )
        );

        const participantNames: string[] = [];
        for (const p of partSnap.docs) {
          const pData = p.data() as ReservationParticipant;
          if (pData.guestName) {
            participantNames.push(pData.guestName);
          } else if (pData.userId && pData.userId !== firebaseUser.uid) {
            // We could fetch the user name here but keep it simple
            participantNames.push('Participante');
          }
        }

        items.push({
          id: resDoc.id,
          start,
          end,
          dateLabel: formatDate(start),
          timeLabel: `${formatTime(start)} – ${formatTime(end)}`,
          isPast: end < now,
          isCreator: data.createdById === firebaseUser.uid,
          participants: participantNames,
          participantCount: partSnap.size,
        });
      }

      items.sort((a, b) => {
        if (tab === 'upcoming') return a.start.getTime() - b.start.getTime();
        return b.start.getTime() - a.start.getTime();
      });

      setReservations(items);
    } catch (e) {
      console.error(e);
      const friendly = getFriendlyError(e);
      if (reservations.length === 0) {
        setError(friendly);
      } else {
        showError(e);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleLeave = async (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert(
      'Sair da reserva',
      'Tem certeza que deseja sair desta reserva?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const partSnap = await getDocs(
                query(
                  collection(db, 'reservationParticipants'),
                  where('reservationId', '==', reservationId),
                  where('userId', '==', firebaseUser.uid)
                )
              );
              if (partSnap.empty) return;

              const allPartSnap = await getDocs(
                query(
                  collection(db, 'reservationParticipants'),
                  where('reservationId', '==', reservationId)
                )
              );

              const batch = writeBatch(db);
              batch.delete(partSnap.docs[0].ref);
              if (allPartSnap.size === 1) {
                batch.delete(doc(db, 'reservations', reservationId));
              }
              await batch.commit();

              setSelected(null);
              setReservations((prev) => prev.filter((r) => r.id !== reservationId));
            } catch (e) {
              console.error(e);
              showError(e);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = async (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert(
      'Cancelar reserva',
      'Isso vai cancelar a reserva para todos os participantes. Deseja continuar?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar reserva',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const partSnap = await getDocs(
                query(
                  collection(db, 'reservationParticipants'),
                  where('reservationId', '==', reservationId)
                )
              );

              const batch = writeBatch(db);
              partSnap.docs.forEach((d) => batch.delete(d.ref));
              batch.delete(doc(db, 'reservations', reservationId));
              await batch.commit();

              setSelected(null);
              setReservations((prev) => prev.filter((r) => r.id !== reservationId));
            } catch (e) {
              console.error(e);
              showError(e);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const displayed = reservations.filter((r) =>
    tab === 'upcoming' ? !r.isPast : r.isPast
  );

  return (
    <View style={styles.container}>
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
      ) : error ? (
        <ErrorState error={error} onRetry={load} fullPage />
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
                  ? 'Nenhuma reserva futura.'
                  : 'Nenhuma reserva anterior.'}
              </Text>
            </View>
          ) : (
            displayed.map((item) => (
              <TouchableOpacity key={item.id} style={styles.card} onPress={() => setSelected(item)}>
                <View style={styles.cardLeft}>
                  <View style={[styles.dot, item.isPast && styles.dotPast]} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardDate}>{item.dateLabel}</Text>
                  <Text style={styles.cardTime}>{item.timeLabel}</Text>
                  {item.participantCount > 1 && (
                    <Text style={styles.cardParticipants}>
                      {item.participantCount} participantes
                    </Text>
                  )}
                </View>
                {!item.isPast && (
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      <View style={styles.fabHint}>
        <Text style={styles.fabHintText}>
          Para criar reservas, acesse o app web ou aguarde a próxima versão do app.
        </Text>
      </View>

      <ReservationDetailModal
        item={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        onCancel={handleCancel}
        onLeave={handleLeave}
        busy={busy}
      />
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
  list: { padding: 16, gap: 10, paddingBottom: 80 },
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
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981' },
  dotPast: { backgroundColor: '#d1d5db' },
  cardContent: { flex: 1 },
  cardDate: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardTime: { fontSize: 13, color: '#6b7280' },
  cardParticipants: { fontSize: 12, color: '#10b981', marginTop: 2 },
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
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalText: { fontSize: 14, color: '#374151', flexShrink: 1 },
  modalActions: { gap: 10, marginTop: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  leaveBtn: { backgroundColor: '#f97316' },
  cancelBtn: { backgroundColor: '#ef4444' },
  disabledBtn: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
