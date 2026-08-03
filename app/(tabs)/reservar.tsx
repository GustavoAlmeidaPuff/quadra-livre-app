import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  writeBatch,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import ErrorState from '@/components/ErrorState';
import { getFriendlyError, FriendlyError } from '@/lib/errors';
import { COURTS, normalizeCourtId } from '@/lib/courts';
import { canManageCourt } from '@/lib/permissions';
import { ReservationType } from '@/types';

const ROW_HEIGHT = 60; // px por hora
const LABEL_WIDTH = 52;

function formatTime(d: Date) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
}

interface RawReservation {
  id: string;
  start: Date;
  end: Date;
  createdById: string;
  courtId: string;
  /** 'organizing' = bloco cinza segurando o horário para um post do "Quem anima?". */
  type: ReservationType;
  quemAnimaPostId?: string | null;
}

interface AgendaReservation extends RawReservation {
  participantNames: string[];
  participantIds: string[];
  isMine: boolean;
  isPast: boolean;
  isCreator: boolean;
  /** Só preenchido quando type === 'organizing'. */
  organizerName?: string;
}

function ReservationDetailModal({
  item,
  onClose,
  onCancel,
  onLeave,
  busy,
}: {
  item: AgendaReservation | null;
  onClose: () => void;
  onCancel: (id: string) => void;
  onLeave: (id: string) => void;
  busy: boolean;
}) {
  if (!item) return null;
  const hasMultiple = item.participantIds.length > 1;

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
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
            <Text style={styles.modalText}>{dayLabel(item.start)}</Text>
          </View>
          <View style={styles.modalRow}>
            <Ionicons name="time-outline" size={16} color="#10b981" />
            <Text style={styles.modalText}>
              {formatTime(item.start)} – {formatTime(item.end)}
            </Text>
          </View>
          {item.participantNames.length > 0 && (
            <View style={styles.modalRow}>
              <Ionicons name="people-outline" size={16} color="#10b981" />
              <Text style={styles.modalText}>{item.participantNames.join(', ')}</Text>
            </View>
          )}

          {!item.isPast && (item.isMine || item.isCreator) && (
            <View style={styles.modalActions}>
              {hasMultiple && !item.isCreator && item.isMine && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.leaveBtn, busy && styles.disabledBtn]}
                  onPress={() => onLeave(item.id)}
                  disabled={busy}
                >
                  <Ionicons name="log-out-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>{busy ? 'Aguarde...' : 'Sair da reserva'}</Text>
                </TouchableOpacity>
              )}
              {item.isCreator && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn, busy && styles.disabledBtn]}
                  onPress={() => onCancel(item.id)}
                  disabled={busy}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>{busy ? 'Aguarde...' : 'Cancelar reserva'}</Text>
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
  const { firebaseUser, appUser } = useAuth();
  const { showError } = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; courtId?: string; reservationId?: string }>();
  const handledReservationId = useRef<string | null>(null);

  const availableCourts = useMemo(
    () => COURTS.filter((c) => !appUser?.courtIds?.length || appUser.courtIds.includes(c.id)),
    [appUser?.courtIds]
  );
  const [selectedCourt, setSelectedCourt] = useState<string>('quadra_1');
  const [courtPickerOpen, setCourtPickerOpen] = useState(false);

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);
  const [selectedDate, setSelectedDate] = useState(() => days[0]);

  const [windowReservations, setWindowReservations] = useState<RawReservation[]>([]);
  const [dayReservations, setDayReservations] = useState<AgendaReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [selected, setSelected] = useState<AgendaReservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const scrollRef = useRef<ScrollView>(null);
  const didScrollToNow = useRef(false);

  // managerIds de cada quadra visível — usado só pra decidir se mostra a engrenagem.
  const [courtManagerIds, setCourtManagerIds] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!availableCourts.length) return;
    (async () => {
      const entries = await Promise.all(
        availableCourts.map(async (c) => {
          const snap = await getDoc(doc(db, 'courts', c.id));
          return [c.id, snap.exists() ? (snap.data().managerIds ?? []) : []] as const;
        })
      );
      setCourtManagerIds(Object.fromEntries(entries));
    })();
  }, [availableCourts]);

  const canManageSelectedCourt =
    !!firebaseUser &&
    canManageCourt(firebaseUser.uid, firebaseUser.email, courtManagerIds[selectedCourt] ?? []);

  // Ajusta a quadra selecionada às quadras do usuário.
  useEffect(() => {
    if (availableCourts.length && !availableCourts.some((c) => c.id === selectedCourt)) {
      setSelectedCourt(availableCourts[0].id);
    }
  }, [availableCourts, selectedCourt]);

  // Ao voltar de uma nova reserva, pula pro dia/quadra reservados.
  useEffect(() => {
    if (params.courtId && availableCourts.some((c) => c.id === params.courtId)) {
      setSelectedCourt(params.courtId);
    }
  }, [params.courtId, availableCourts]);

  useEffect(() => {
    if (params.date) {
      const found = days.find((d) => dateKey(d) === params.date);
      if (found) setSelectedDate(found);
    }
  }, [params.date, days]);

  // Relógio para a linha vermelha (atualiza a cada minuto).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Carrega reservas de toda a janela de 7 dias (todas as quadras).
  const loadWindow = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setError(null);
      const first = new Date(days[0]);
      first.setDate(first.getDate() - 1);
      first.setHours(0, 0, 0, 0);
      const last = new Date(days[days.length - 1]);
      last.setHours(23, 59, 59, 999);

      const snap = await getDocs(
        query(
          collection(db, 'reservations'),
          where('startAt', '>=', Timestamp.fromDate(first)),
          where('startAt', '<=', Timestamp.fromDate(last)),
          orderBy('startAt', 'asc')
        )
      );
      const raw: RawReservation[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          start: data.startAt?.toDate?.() ?? new Date(),
          end: data.endAt?.toDate?.() ?? new Date(),
          createdById: data.createdById ?? '',
          courtId: normalizeCourtId(data.courtId),
          type: (data.type ?? 'game') as ReservationType,
          quemAnimaPostId: data.quemAnimaPostId ?? null,
        };
      });
      setWindowReservations(raw);
    } catch (e) {
      console.error(e);
      const friendly = getFriendlyError(e);
      if (windowReservations.length === 0) setError(friendly);
      else showError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, days]);

  useEffect(() => { setLoading(true); loadWindow(); }, [loadWindow]);
  const onRefresh = () => { setRefreshing(true); loadWindow(); };

  // Dias (por quadra) que têm reservas — para o pontinho no seletor.
  const daysWithReservations = useMemo(() => {
    const set = new Set<string>();
    for (const r of windowReservations) {
      if (r.courtId !== selectedCourt) continue;
      for (const day of days) {
        const ds = new Date(day); ds.setHours(0, 0, 0, 0);
        const de = new Date(day); de.setHours(23, 59, 59, 999);
        if (r.end.getTime() > ds.getTime() && r.start.getTime() <= de.getTime()) {
          set.add(dateKey(day));
        }
      }
    }
    return set;
  }, [windowReservations, selectedCourt, days]);

  // Reservas do dia/quadra selecionados, com nomes dos participantes.
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;

    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
    const overlapping = windowReservations.filter(
      (r) => r.courtId === selectedCourt && r.end > dayStart && r.start <= dayEnd
    );

    (async () => {
      const items: AgendaReservation[] = [];
      for (const r of overlapping) {
        // Bloco de organização ainda não tem jogadores — mostra quem está organizando.
        if (r.type === 'organizing') {
          const uSnap = await getDoc(doc(db, 'users', r.createdById));
          const u = uSnap.exists() ? uSnap.data() : null;
          items.push({
            ...r,
            participantNames: [],
            participantIds: [],
            organizerName: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'alguém',
            isMine: r.createdById === firebaseUser.uid,
            isCreator: r.createdById === firebaseUser.uid,
            isPast: r.end < new Date(),
          });
          continue;
        }

        const partSnap = await getDocs(
          query(collection(db, 'reservationParticipants'), where('reservationId', '==', r.id))
        );
        const names: string[] = [];
        const ids: string[] = [];
        for (const p of partSnap.docs) {
          const pData = p.data();
          if (pData.userId) {
            ids.push(pData.userId);
            const uSnap = await getDoc(doc(db, 'users', pData.userId));
            if (uSnap.exists()) {
              const u = uSnap.data();
              const isAnon = u?.isAnonymous === true;
              names.push(isAnon ? 'Anônimo' : `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Jogador');
            }
          } else if (pData.guestName) {
            names.push(pData.guestName);
          }
        }
        items.push({
          ...r,
          participantNames: names,
          participantIds: ids,
          isMine: ids.includes(firebaseUser.uid),
          isCreator: r.createdById === firebaseUser.uid,
          isPast: r.end < new Date(),
        });
      }
      if (!cancelled) setDayReservations(items);
    })();

    return () => { cancelled = true; };
  }, [selectedDate, selectedCourt, windowReservations, firebaseUser]);

  // Abre o modal de detalhes da reserva recém-criada assim que ela aparece na agenda.
  useEffect(() => {
    if (params.reservationId && params.reservationId !== handledReservationId.current) {
      const found = dayReservations.find((r) => r.id === params.reservationId);
      if (found) {
        setSelected(found);
        handledReservationId.current = params.reservationId;
      }
    }
  }, [params.reservationId, dayReservations]);

  // Scroll inicial até perto do horário atual.
  useEffect(() => {
    if (loading || didScrollToNow.current) return;
    didScrollToNow.current = true;
    const h = new Date().getHours();
    const y = Math.max(0, (h - 1) * ROW_HEIGHT);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 150);
  }, [loading]);

  const handleLeave = (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert('Sair da reserva', 'Tem certeza que deseja sair desta reserva?', [
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
              query(collection(db, 'reservationParticipants'), where('reservationId', '==', reservationId))
            );
            const batch = writeBatch(db);
            batch.delete(partSnap.docs[0].ref);
            if (allPartSnap.size === 1) batch.delete(doc(db, 'reservations', reservationId));
            await batch.commit();
            setSelected(null);
            loadWindow(); // recarrega: se sobrou gente, a reserva continua (agora não é minha)
          } catch (e) {
            console.error(e);
            showError(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleCancel = (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert('Cancelar reserva', 'Isso vai cancelar a reserva para todos os participantes. Deseja continuar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar reserva',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const partSnap = await getDocs(
              query(collection(db, 'reservationParticipants'), where('reservationId', '==', reservationId))
            );
            const batch = writeBatch(db);
            partSnap.docs.forEach((d) => batch.delete(d.ref));
            batch.delete(doc(db, 'reservations', reservationId));
            await batch.commit();
            setSelected(null);
            setWindowReservations((prev) => prev.filter((r) => r.id !== reservationId));
          } catch (e) {
            console.error(e);
            showError(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const isToday = selectedDate.toDateString() === now.toDateString();
  const nowTop = isToday ? (now.getHours() * 60 + now.getMinutes()) * (ROW_HEIGHT / 60) : null;
  const selectedCourtName = COURTS.find((c) => c.id === selectedCourt)?.name ?? '';
  const dayStartForBlocks = new Date(selectedDate);
  dayStartForBlocks.setHours(0, 0, 0, 0);

  return (
    <View style={styles.container}>
      {/* Seletor de quadra */}
      <View style={styles.courtSelector}>
        <TouchableOpacity
          style={styles.courtSelectorMain}
          onPress={() => availableCourts.length > 1 && setCourtPickerOpen(true)}
          activeOpacity={availableCourts.length > 1 ? 0.7 : 1}
        >
          <Text style={styles.courtName}>{selectedCourtName}</Text>
          {availableCourts.length > 1 && <Ionicons name="chevron-down" size={20} color="#9ca3af" />}
        </TouchableOpacity>
        {availableCourts.length === 1 && canManageSelectedCourt && (
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => router.push({ pathname: '/gerenciar-quadra', params: { courtId: selectedCourt } })}
          >
            <Ionicons name="settings-outline" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Seletor de dia */}
      <View style={styles.daySelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayScroll}>
          {days.map((d) => {
            const active = d.toDateString() === selectedDate.toDateString();
            return (
              <TouchableOpacity
                key={dateKey(d)}
                style={[styles.dayChip, active && styles.dayChipActive]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[styles.dayChipWeekday, active && styles.dayChipTextActive]}>
                  {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()}
                </Text>
                <Text style={[styles.dayChipNumber, active && styles.dayChipTextActive]}>{d.getDate()}</Text>
                {daysWithReservations.has(dateKey(d)) && (
                  <View style={[styles.dayDot, active && styles.dayDotActive]} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={loadWindow} fullPage />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.timelineScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        >
          <View style={{ height: 24 * ROW_HEIGHT }}>
            {/* Grade de horas */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={styles.hourRow}>
                <Text style={styles.hourLabel}>{String(h).padStart(2, '0')}:00</Text>
                <View style={styles.hourLine} />
              </View>
            ))}

            {/* Blocos de reserva */}
            {dayReservations.map((r) => {
              const startMin = Math.max(0, (r.start.getTime() - dayStartForBlocks.getTime()) / 60000);
              const endMin = Math.min(24 * 60, (r.end.getTime() - dayStartForBlocks.getTime()) / 60000);
              const top = startMin * (ROW_HEIGHT / 60);
              const height = Math.max(32, (endMin - startMin) * (ROW_HEIGHT / 60));
              const isOrganizing = r.type === 'organizing';

              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.block,
                    { top, height },
                    isOrganizing
                      ? styles.blockOrganizing
                      : r.isMine
                      ? styles.blockMine
                      : styles.blockOther,
                  ]}
                  onPress={() => {
                    // O bloco cinza não é uma reserva de verdade: leva ao post.
                    if (isOrganizing) {
                      if (r.quemAnimaPostId) {
                        router.push({ pathname: '/quem-anima/[id]', params: { id: r.quemAnimaPostId } });
                      }
                      return;
                    }
                    setSelected(r);
                  }}
                  activeOpacity={0.8}
                >
                  {isOrganizing ? (
                    <View style={styles.blockOrganizingRow}>
                      <Ionicons name="hand-right-outline" size={13} color="#4b5563" />
                      <Text style={styles.blockOrganizingText} numberOfLines={1}>
                        Reserva sendo organizada por {r.isMine ? 'você' : r.organizerName}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.blockNames, r.isMine ? styles.blockNamesMine : styles.blockNamesOther]}
                      numberOfLines={1}
                    >
                      {r.participantNames.join(', ') || '—'}
                    </Text>
                  )}
                  <Text style={styles.blockTime}>
                    {formatTime(r.start)} – {formatTime(r.end)}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Linha do "agora" */}
            {nowTop !== null && (
              <View style={[styles.nowLine, { top: nowTop }]} pointerEvents="none">
                <View style={styles.nowBadge}>
                  <Text style={styles.nowBadgeText}>
                    {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.nowBar} />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* FAB nova reserva */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          router.push({
            pathname: '/nova-reserva',
            params: { date: dateKey(selectedDate), courtId: selectedCourt },
          })
        }
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

      {/* Dropdown de quadra */}
      <Modal visible={courtPickerOpen} transparent animationType="fade" onRequestClose={() => setCourtPickerOpen(false)}>
        <TouchableOpacity style={styles.courtOverlay} activeOpacity={1} onPress={() => setCourtPickerOpen(false)}>
          <View style={styles.courtMenu}>
            {availableCourts.map((c) => {
              const canManageThis =
                !!firebaseUser && canManageCourt(firebaseUser.uid, firebaseUser.email, courtManagerIds[c.id] ?? []);
              return (
                <View key={c.id} style={styles.courtMenuItem}>
                  <TouchableOpacity
                    style={styles.courtMenuItemMain}
                    onPress={() => { setSelectedCourt(c.id); setCourtPickerOpen(false); }}
                  >
                    <Text style={[styles.courtMenuText, selectedCourt === c.id && styles.courtMenuTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.courtMenuRight}>
                    {canManageThis && (
                      <TouchableOpacity
                        style={styles.gearBtnSm}
                        onPress={() => {
                          setCourtPickerOpen(false);
                          router.push({ pathname: '/gerenciar-quadra', params: { courtId: c.id } });
                        }}
                      >
                        <Ionicons name="settings-outline" size={18} color="#6b7280" />
                      </TouchableOpacity>
                    )}
                    {selectedCourt === c.id && <Ionicons name="checkmark" size={20} color="#10b981" />}
                  </View>
                </View>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <ReservationDetailModal
        item={selected}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  courtSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  courtSelectorMain: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  courtName: { fontSize: 20, fontWeight: '800', color: '#111827' },
  gearBtn: { padding: 6, marginLeft: 8 },
  gearBtnSm: { padding: 6, marginRight: 4 },

  daySelector: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 10,
  },
  dayScroll: { paddingHorizontal: 12, gap: 8 },
  dayChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 48,
  },
  dayChipActive: { backgroundColor: '#10b981' },
  dayChipWeekday: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  dayChipNumber: { fontSize: 18, fontWeight: '700', color: '#111827' },
  dayChipTextActive: { color: '#ffffff' },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#10b981', marginTop: 3 },
  dayDotActive: { backgroundColor: '#ffffff' },

  timelineScroll: { flex: 1 },
  hourRow: { height: ROW_HEIGHT, flexDirection: 'row' },
  hourLabel: {
    width: LABEL_WIDTH,
    fontSize: 12,
    color: '#9ca3af',
    paddingTop: 2,
    paddingLeft: 12,
  },
  hourLine: { flex: 1, borderTopWidth: 1, borderTopColor: '#f3f4f6' },

  block: {
    position: 'absolute',
    left: LABEL_WIDTH + 4,
    right: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blockMine: { backgroundColor: '#d1fae5', borderLeftColor: '#10b981' },
  blockOther: { backgroundColor: '#fef9c3', borderLeftColor: '#eab308' },
  // Cinza: horário segurado por um post do "Quem anima?", jogo ainda não fechado.
  blockOrganizing: {
    backgroundColor: '#f3f4f6',
    borderLeftColor: '#9ca3af',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderLeftWidth: 4,
  },
  blockOrganizingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockOrganizingText: { fontSize: 12, fontWeight: '600', color: '#4b5563', flex: 1 },
  blockNames: { fontSize: 13, fontWeight: '700' },
  blockNamesMine: { color: '#065f46' },
  blockNamesOther: { color: '#854d0e' },
  blockTime: { fontSize: 11, color: '#6b7280', marginTop: 1 },

  nowLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowBadge: {
    width: LABEL_WIDTH,
    alignItems: 'center',
  },
  nowBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    backgroundColor: '#fff',
  },
  nowBar: { flex: 1, height: 2, backgroundColor: '#ef4444' },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  courtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  courtMenu: {
    backgroundColor: '#ffffff',
    marginTop: 100,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  courtMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  courtMenuItemMain: { flex: 1 },
  courtMenuRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  courtMenuText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  courtMenuTextActive: { fontWeight: '700', color: '#065f46' },

  // Modal detalhes
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
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
