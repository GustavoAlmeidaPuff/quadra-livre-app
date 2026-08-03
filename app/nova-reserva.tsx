import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';
import WheelTimePicker from '@/components/WheelTimePicker';
import { COURTS } from '@/lib/courts';
import { getSuggestedPartners, PartnerStat } from '@/lib/stats';
import { createReservation, getCourtRules, computeEndAt } from '@/lib/reservations';
import { CourtReservationRules } from '@/types';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6h – 23h
const MINUTES = ['00', '15', '30', '45'];

interface PickableUser {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
}

function getInitials(firstName?: string, lastName?: string): string {
  const a = (firstName || 'J')[0] ?? 'J';
  const b = (lastName || '')[0] ?? '';
  return `${a}${b}`.toUpperCase();
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function NovaReservaScreen() {
  const params = useLocalSearchParams<{ date?: string; hour?: string; courtId?: string }>();
  const router = useRouter();
  const { firebaseUser, appUser } = useAuth();
  const { showError, showToast } = useToast();

  // Janela de 7 dias a partir de hoje
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const initialDateISO = params.date && days.some((d) => localISO(d) === params.date)
    ? params.date
    : localISO(days[0]);
  const initialHour = params.hour != null && !Number.isNaN(parseInt(params.hour, 10))
    ? Math.min(23, Math.max(0, parseInt(params.hour, 10)))
    : 19;

  const availableCourts = COURTS.filter(
    (c) => !appUser?.courtIds?.length || appUser.courtIds.includes(c.id)
  );
  const initialCourt = params.courtId && availableCourts.some((c) => c.id === params.courtId)
    ? params.courtId
    : availableCourts[0]?.id ?? 'quadra_1';

  const [dateISO, setDateISO] = useState(initialDateISO);
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState('00');
  // Trava o scroll da tela enquanto o dedo está na roda de horário.
  const [wheelActive, setWheelActive] = useState(false);
  const [courtId, setCourtId] = useState<string>(initialCourt);
  const [rules, setRules] = useState<CourtReservationRules | null>(null);

  const [suggested, setSuggested] = useState<PartnerStat[]>([]);
  const [allUsers, setAllUsers] = useState<PickableUser[]>([]);
  const [selected, setSelected] = useState<PickableUser[]>([]);
  const [search, setSearch] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Carrega parceiros sugeridos, todos os usuários e as regras da quadra.
  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      try {
        const [partners, usersSnap] = await Promise.all([
          getSuggestedPartners(firebaseUser.uid),
          getDocs(collection(db, 'users')),
        ]);
        setSuggested(partners);
        const users: PickableUser[] = usersSnap.docs
          .filter((d) => d.id !== firebaseUser.uid && d.data().isAnonymous !== true)
          .map((d) => {
            const u = d.data();
            return {
              id: d.id,
              name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Jogador',
              initials: getInitials(u.firstName, u.lastName),
              pictureUrl: u.pictureUrl,
            };
          });
        setAllUsers(users);
      } catch (e) {
        showError(e);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [firebaseUser]);

  useEffect(() => {
    getCourtRules(courtId).then(setRules);
  }, [courtId]);

  const startDate = useMemo(() => {
    const [y, m, d] = dateISO.split('-').map(Number);
    return new Date(y, m - 1, d, hour, parseInt(minute, 10), 0, 0);
  }, [dateISO, hour, minute]);
  const endDate = useMemo(() => computeEndAt(startDate, rules), [startDate, rules]);

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (u: PickableUser) => {
    setSelected((prev) => (prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]));
  };

  const searchResults =
    search.trim() === ''
      ? []
      : allUsers
          .filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase()))
          .slice(0, 8);

  const handleConfirm = async () => {
    if (!firebaseUser) return;
    setSubmitting(true);
    try {
      const reservationId = await createReservation({
        createdById: firebaseUser.uid,
        startAt: startDate,
        courtId,
        participantIds: selected.map((s) => s.id),
      });
      showToast({ variant: 'success', title: 'Reserva confirmada!' });
      router.replace({
        pathname: '/(tabs)/reservar',
        params: { date: dateISO, courtId, reservationId },
      });
    } catch (e) {
      // createReservation lança Error com mensagem amigável de validação.
      const message = e instanceof Error ? e.message : 'Não foi possível reservar.';
      showToast({ variant: 'error', title: 'Não foi possível reservar', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Nova reserva' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!wheelActive}
      >
        {/* Quadra */}
        {availableCourts.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>QUADRA</Text>
            <View style={styles.rowWrap}>
              {availableCourts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, courtId === c.id && styles.chipActive]}
                  onPress={() => setCourtId(c.id)}
                >
                  <Text style={[styles.chipText, courtId === c.id && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Dia */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DIA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroll}>
            {days.map((d) => {
              const iso = localISO(d);
              const active = iso === dateISO;
              return (
                <TouchableOpacity
                  key={iso}
                  style={[styles.dayChip, active && styles.chipActive]}
                  onPress={() => setDateISO(iso)}
                >
                  <Text style={[styles.dayChipWeekday, active && styles.chipTextActive]}>
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </Text>
                  <Text style={[styles.dayChipNumber, active && styles.chipTextActive]}>{d.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Horário */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HORÁRIO</Text>
          <WheelTimePicker
            hours={HOURS}
            minutes={MINUTES}
            hour={hour}
            minute={minute}
            onChange={(h, m) => {
              setHour(h);
              setMinute(m);
            }}
            onScrollLock={setWheelActive}
          />
          <Text style={styles.endHint}>
            Termina às {fmtTime(endDate)} · {fmtTime(startDate)} – {fmtTime(endDate)}
          </Text>
        </View>

        {/* Participantes sugeridos */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ADICIONAR JOGADORES</Text>
          {loadingData ? (
            <ActivityIndicator color="#10b981" style={{ marginVertical: 12 }} />
          ) : (
            <>
              {suggested.length > 0 && (
                <>
                  <Text style={styles.suggestHint}>Quem você mais joga</Text>
                  {suggested.map((p) => {
                    const active = isSelected(p.userId);
                    return (
                      <TouchableOpacity
                        key={p.userId}
                        style={[styles.partnerRow, active && styles.partnerRowActive]}
                        onPress={() => toggle({ id: p.userId, name: p.name, initials: p.initials, pictureUrl: p.pictureUrl })}
                      >
                        <Avatar uri={p.pictureUrl} initials={p.initials} size={38} fontSize={14} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.partnerName}>{p.name}</Text>
                          <Text style={styles.partnerMeta}>{p.count} {p.count === 1 ? 'jogo' : 'jogos'} juntos</Text>
                        </View>
                        <Ionicons
                          name={active ? 'checkmark-circle' : 'add-circle-outline'}
                          size={24}
                          color={active ? '#10b981' : '#9ca3af'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* Selecionados que não estão na lista de sugestões */}
              {selected
                .filter((s) => !suggested.some((p) => p.userId === s.id))
                .map((s) => (
                  <TouchableOpacity key={s.id} style={[styles.partnerRow, styles.partnerRowActive]} onPress={() => toggle(s)}>
                    <Avatar uri={s.pictureUrl} initials={s.initials} size={38} fontSize={14} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.partnerName}>{s.name}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  </TouchableOpacity>
                ))}

              {/* Busca */}
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color="#9ca3af" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar outro jogador..."
                  placeholderTextColor="#9ca3af"
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                />
              </View>
              {searchResults.map((u) => (
                <TouchableOpacity key={u.id} style={styles.partnerRow} onPress={() => { toggle(u); setSearch(''); }}>
                  <Avatar uri={u.pictureUrl} initials={u.initials} size={32} />
                  <Text style={[styles.partnerName, { flex: 1 }]}>{u.name}</Text>
                  <Ionicons
                    name={isSelected(u.id) ? 'checkmark-circle' : 'add-circle-outline'}
                    size={22}
                    color={isSelected(u.id) ? '#10b981' : '#9ca3af'}
                  />
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Confirmar */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#ffffff" />
              <Text style={styles.confirmBtnText}>
                Confirmar reserva{selected.length > 0 ? ` (+${selected.length})` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 24, gap: 20 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowScroll: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#ffffff' },
  dayChip: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 52,
  },
  dayChipWeekday: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  dayChipNumber: { fontSize: 18, fontWeight: '700', color: '#111827' },
  endHint: { fontSize: 13, color: '#6b7280', marginTop: 6 },
  suggestHint: { fontSize: 12, color: '#9ca3af', marginBottom: 2 },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  partnerRowActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  partnerName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  partnerMeta: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 4,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: '#111827' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  confirmBtn: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
