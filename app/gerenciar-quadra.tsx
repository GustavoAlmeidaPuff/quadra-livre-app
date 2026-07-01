import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import ErrorState from '@/components/ErrorState';
import { getFriendlyError, FriendlyError } from '@/lib/errors';
import { getCourtName } from '@/lib/courts';
import { Court, CourtReservationRules, DurationMode } from '@/types';

interface UserBasic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const DEFAULT_RULES: CourtReservationRules = {
  durationMode: 'fixed',
  fixedMinutes: 90,
  maxMinutes: 300,
};

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

function NumberStepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Ionicons name="remove" size={18} color="#374151" />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>
        {value}
        {suffix}
      </Text>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Ionicons name="add" size={18} color="#374151" />
      </TouchableOpacity>
    </View>
  );
}

export default function GerenciarQuadraScreen() {
  const params = useLocalSearchParams<{ courtId?: string }>();
  const courtId = params.courtId ?? 'quadra_1';
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { showError, showSuccess } = useToast();

  const [court, setCourt] = useState<Court | null>(null);
  const [managers, setManagers] = useState<UserBasic[]>([]);
  const [allUsers, setAllUsers] = useState<UserBasic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FriendlyError | null>(null);

  const [durationMode, setDurationMode] = useState<DurationMode>('fixed');
  const [fixedHours, setFixedHours] = useState(1);
  const [fixedMins, setFixedMins] = useState(30);
  const [maxHours, setMaxHours] = useState(5);
  const [maxMinsExtra, setMaxMinsExtra] = useState(0);
  const [maxReservationsPerDay, setMaxReservationsPerDay] = useState<number | null>(null);
  const [maxReservationsPerWeek, setMaxReservationsPerWeek] = useState<number | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  const loadCourt = async () => {
    const snap = await getDoc(doc(db, 'courts', courtId));
    if (!snap.exists()) {
      router.back();
      return;
    }
    const data = snap.data() as Omit<Court, 'id'>;
    const courtData: Court = { id: snap.id, ...data };
    setCourt(courtData);

    const rules = courtData.reservationRules ?? DEFAULT_RULES;
    setDurationMode(rules.durationMode);
    setFixedHours(Math.floor(rules.fixedMinutes / 60));
    setFixedMins(rules.fixedMinutes % 60);
    setMaxHours(Math.floor(rules.maxMinutes / 60));
    setMaxMinsExtra(rules.maxMinutes % 60);
    setMaxReservationsPerDay(rules.maxReservationsPerDay ?? null);
    setMaxReservationsPerWeek(rules.maxReservationsPerWeek ?? null);

    const managerUsers: UserBasic[] = [];
    for (const uid of courtData.managerIds ?? []) {
      const uSnap = await getDoc(doc(db, 'users', uid));
      if (uSnap.exists()) {
        const u = uSnap.data();
        managerUsers.push({
          id: uSnap.id,
          firstName: u.firstName ?? '',
          lastName: u.lastName ?? '',
          email: u.email ?? '',
        });
      }
    }
    setManagers(managerUsers);
  };

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        await loadCourt();
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(
          usersSnap.docs
            .filter((d) => d.data().isAnonymous !== true)
            .map((d) => ({
              id: d.id,
              firstName: d.data().firstName ?? '',
              lastName: d.data().lastName ?? '',
              email: d.data().email ?? '',
            }))
        );
      } catch (e) {
        setError(getFriendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [courtId]);

  const handleAddManager = async (user: UserBasic) => {
    try {
      await updateDoc(doc(db, 'courts', courtId), { managerIds: arrayUnion(user.id) });
      setSearchTerm('');
      await loadCourt();
      showSuccess('Chefe de quadra adicionado');
    } catch (e) {
      showError(e, 'Não foi possível adicionar');
    }
  };

  const handleRemoveManager = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'courts', courtId), { managerIds: arrayRemove(userId) });
      await loadCourt();
      showSuccess('Chefe de quadra removido');
    } catch (e) {
      showError(e, 'Não foi possível remover');
    }
  };

  const handleSaveRules = async () => {
    setSavingRules(true);
    setRulesSaved(false);
    try {
      const rules: CourtReservationRules = {
        durationMode,
        fixedMinutes: fixedHours * 60 + fixedMins,
        maxMinutes: maxHours * 60 + maxMinsExtra,
        maxReservationsPerDay: maxReservationsPerDay ?? null,
        maxReservationsPerWeek: maxReservationsPerWeek ?? null,
      };
      await updateDoc(doc(db, 'courts', courtId), { reservationRules: rules });
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2500);
    } catch (e) {
      showError(e, 'Não foi possível salvar as regras');
    } finally {
      setSavingRules(false);
    }
  };

  const currentFixedTotal = fixedHours * 60 + fixedMins;
  const currentMaxTotal = maxHours * 60 + maxMinsExtra;

  const suggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return allUsers
      .filter(
        (u) =>
          u.email.toLowerCase().includes(term) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(term)
      )
      .filter((u) => !managers.some((m) => m.id === u.id))
      .slice(0, 5);
  }, [searchTerm, allUsers, managers]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }
  if (error) {
    return <ErrorState error={error} onRetry={() => { setLoading(true); loadCourt().finally(() => setLoading(false)); }} fullPage />;
  }

  const saveDisabled =
    savingRules ||
    (durationMode === 'fixed' && currentFixedTotal === 0) ||
    (durationMode === 'max' && currentMaxTotal === 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: court?.name ?? getCourtName(courtId) }} />

      {/* Regras de reserva */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>REGRAS DE RESERVA</Text>

        <Text style={styles.label}>Tipo de duração</Text>
        <View style={styles.rowWrap}>
          {(
            [
              { value: 'fixed', label: 'Fixa' },
              { value: 'free', label: 'Livre' },
              { value: 'max', label: 'Máximo' },
            ] as { value: DurationMode; label: string }[]
          ).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionBtn, durationMode === opt.value && styles.optionBtnActive]}
              onPress={() => setDurationMode(opt.value)}
            >
              <Text style={[styles.optionBtnText, durationMode === opt.value && styles.optionBtnTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>
          {durationMode === 'fixed' && 'Todas as reservas terão exatamente a duração configurada.'}
          {durationMode === 'free' && 'Jogadores escolhem livremente o horário de início e fim.'}
          {durationMode === 'max' && 'Jogadores escolhem a duração, respeitando o limite máximo.'}
        </Text>

        {durationMode === 'fixed' && (
          <View style={styles.subsection}>
            <Text style={styles.label}>Duração fixa</Text>
            <View style={styles.stepperRow}>
              <NumberStepper value={fixedHours} onChange={setFixedHours} min={0} max={23} suffix="h" />
              <NumberStepper value={fixedMins} onChange={setFixedMins} min={0} max={59} suffix="min" />
              {currentFixedTotal > 0 && <Text style={styles.totalText}>= {formatMins(currentFixedTotal)}</Text>}
            </View>
          </View>
        )}

        {durationMode === 'max' && (
          <View style={styles.subsection}>
            <Text style={styles.label}>Duração máxima</Text>
            <View style={styles.stepperRow}>
              <NumberStepper value={maxHours} onChange={setMaxHours} min={0} max={23} suffix="h" />
              <NumberStepper value={maxMinsExtra} onChange={setMaxMinsExtra} min={0} max={59} suffix="min" />
              {currentMaxTotal > 0 && <Text style={styles.totalText}>= {formatMins(currentMaxTotal)}</Text>}
            </View>
          </View>
        )}

        <View style={styles.subsection}>
          <Text style={styles.label}>Reservas por dia (por pessoa)</Text>
          <View style={styles.rowWrap}>
            <TouchableOpacity
              style={[styles.optionBtn, maxReservationsPerDay === null && styles.optionBtnActive]}
              onPress={() => setMaxReservationsPerDay(null)}
            >
              <Text style={[styles.optionBtnText, maxReservationsPerDay === null && styles.optionBtnTextActive]}>Livre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, maxReservationsPerDay !== null && styles.optionBtnActive]}
              onPress={() => setMaxReservationsPerDay((prev) => prev ?? 1)}
            >
              <Text style={[styles.optionBtnText, maxReservationsPerDay !== null && styles.optionBtnTextActive]}>Limitado</Text>
            </TouchableOpacity>
          </View>
          {maxReservationsPerDay !== null && (
            <View style={{ marginTop: 8 }}>
              <NumberStepper
                value={maxReservationsPerDay}
                onChange={setMaxReservationsPerDay}
                min={1}
                max={20}
                suffix=" reserva(s)/dia"
              />
            </View>
          )}
          <Text style={styles.hint}>
            {maxReservationsPerDay === null
              ? 'Sem limite de reservas por dia nesta quadra.'
              : `Cada pessoa pode fazer no máximo ${maxReservationsPerDay} reserva(s) por dia nesta quadra.`}
          </Text>
        </View>

        <View style={styles.subsection}>
          <Text style={styles.label}>Reservas por semana (por pessoa)</Text>
          <View style={styles.rowWrap}>
            <TouchableOpacity
              style={[styles.optionBtn, maxReservationsPerWeek === null && styles.optionBtnActive]}
              onPress={() => setMaxReservationsPerWeek(null)}
            >
              <Text style={[styles.optionBtnText, maxReservationsPerWeek === null && styles.optionBtnTextActive]}>Livre</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, maxReservationsPerWeek !== null && styles.optionBtnActive]}
              onPress={() => setMaxReservationsPerWeek((prev) => prev ?? 1)}
            >
              <Text style={[styles.optionBtnText, maxReservationsPerWeek !== null && styles.optionBtnTextActive]}>Limitado</Text>
            </TouchableOpacity>
          </View>
          {maxReservationsPerWeek !== null && (
            <View style={{ marginTop: 8 }}>
              <NumberStepper
                value={maxReservationsPerWeek}
                onChange={setMaxReservationsPerWeek}
                min={1}
                max={50}
                suffix=" reserva(s)/sem"
              />
            </View>
          )}
          <Text style={styles.hint}>
            {maxReservationsPerWeek === null
              ? 'Sem limite de reservas por semana nesta quadra.'
              : `Cada pessoa pode fazer no máximo ${maxReservationsPerWeek} reserva(s) por semana nesta quadra.`}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
          onPress={handleSaveRules}
          disabled={saveDisabled}
        >
          <Text style={styles.saveBtnText}>
            {savingRules ? 'Salvando...' : rulesSaved ? 'Salvo!' : 'Salvar regras'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chefes atuais */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>CHEFES ATUAIS</Text>
        {managers.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum chefe cadastrado.</Text>
        ) : (
          managers.map((m) => (
            <View key={m.id} style={styles.managerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.managerName}>
                  {m.firstName} {m.lastName}
                </Text>
                <Text style={styles.managerEmail}>{m.email}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveManager(m.id)} style={styles.removeBtn}>
                <Ionicons name="person-remove-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Adicionar chefe */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ADICIONAR CHEFE</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou e-mail"
            placeholderTextColor="#9ca3af"
            value={searchTerm}
            onChangeText={setSearchTerm}
            autoCapitalize="none"
          />
        </View>
        {suggestions.map((u) => (
          <TouchableOpacity key={u.id} style={styles.suggestionRow} onPress={() => handleAddManager(u)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.managerName}>
                {u.firstName} {u.lastName}
              </Text>
              <Text style={styles.managerEmail}>{u.email}</Text>
            </View>
            <Ionicons name="person-add-outline" size={18} color="#10b981" />
          </TouchableOpacity>
        ))}
        {searchTerm.trim() && suggestions.length === 0 && (
          <Text style={styles.emptyText}>Nenhum usuário encontrado.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  subsection: { marginTop: 6 },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },

  rowWrap: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  optionBtnActive: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  optionBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  optionBtnTextActive: { color: '#047857' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 70, textAlign: 'center' },
  totalText: { fontSize: 13, fontWeight: '600', color: '#10b981' },

  saveBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 10,
  },
  managerName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  managerEmail: { fontSize: 12, color: '#6b7280' },
  removeBtn: { padding: 6 },
  emptyText: { fontSize: 13, color: '#9ca3af' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#111827' },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
});
