import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';
import WheelTimePicker from '@/components/WheelTimePicker';
import { COURTS } from '@/lib/courts';
import { getSuggestedPartners, PartnerStat } from '@/lib/stats';
import { createQuemAnimaPost, localISO } from '@/lib/quemAnima';
import { GameFormat, QuemAnimaTimeMode } from '@/types';
import { maskPhoneBR, isValidPhoneBR, toStoredPhone, fromStoredPhone } from '@/lib/phone';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6h – 23h
const MINUTES = ['00', '15', '30', '45'];

const FORMATS: { key: GameFormat; label: string; hint: string }[] = [
  { key: '1x1', label: '1x1', hint: 'Simples' },
  { key: '2x2', label: '2x2', hint: 'Duplas' },
  { key: 'ambos', label: 'Tanto faz', hint: 'Simples ou duplas' },
];

interface PickableUser {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
}

function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName || 'J')[0] ?? 'J'}${(lastName || '')[0] ?? ''}`.toUpperCase();
}

export default function NovoQuemAnimaScreen() {
  const router = useRouter();
  const { firebaseUser, appUser, refreshUser } = useAuth();
  const { showToast } = useToast();

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const availableCourts = COURTS.filter(
    (c) => !appUser?.courtIds?.length || appUser.courtIds.includes(c.id)
  );

  const [format, setFormat] = useState<GameFormat>('ambos');
  const [courtId, setCourtId] = useState<string>(availableCourts[0]?.id ?? 'quadra_1');
  const [dateISO, setDateISO] = useState(localISO(days[0]));
  const [timeMode, setTimeMode] = useState<QuemAnimaTimeMode>('fixed');
  const [hour, setHour] = useState(19);
  const [minute, setMinute] = useState('00');
  const [description, setDescription] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const [phone, setPhone] = useState('');

  const [suggested, setSuggested] = useState<PartnerStat[]>([]);
  const [allUsers, setAllUsers] = useState<PickableUser[]>([]);
  const [selected, setSelected] = useState<PickableUser[]>([]);
  const [search, setSearch] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const savedPhone = fromStoredPhone(appUser?.phone);
  const hasSavedPhone = !!appUser?.phone;

  useEffect(() => {
    setPhone(savedPhone);
  }, [savedPhone]);

  useEffect(() => {
    if (!firebaseUser) return;
    (async () => {
      try {
        const [partners, usersSnap] = await Promise.all([
          getSuggestedPartners(firebaseUser.uid),
          getDocs(collection(db, 'users')),
        ]);
        setSuggested(partners);
        setAllUsers(
          usersSnap.docs
            .filter((d) => d.id !== firebaseUser.uid && d.data().isAnonymous !== true)
            .map((d) => {
              const u = d.data();
              return {
                id: d.id,
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Jogador',
                initials: getInitials(u.firstName, u.lastName),
                pictureUrl: u.pictureUrl,
              };
            })
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [firebaseUser]);

  const startDate = useMemo(() => {
    const [y, m, d] = dateISO.split('-').map(Number);
    return new Date(y, m - 1, d, hour, parseInt(minute, 10), 0, 0);
  }, [dateISO, hour, minute]);

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (u: PickableUser) =>
    setSelected((prev) =>
      prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]
    );

  const searchResults =
    search.trim() === ''
      ? []
      : allUsers.filter((u) => u.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8);

  // Sem comentários e sem WhatsApp, ninguém consegue falar com o autor.
  const noContactMethod = !allowComments && !showWhatsapp;

  const handleSubmit = async () => {
    if (!firebaseUser || !appUser) return;

    if (noContactMethod) {
      showToast({
        variant: 'error',
        title: 'Escolha como querem te achar',
        description: 'Deixe os comentários ligados ou compartilhe seu WhatsApp.',
      });
      return;
    }
    if (showWhatsapp && !isValidPhoneBR(phone)) {
      showToast({
        variant: 'error',
        title: 'Número incompleto',
        description: 'Digite DDD + número, ex.: (51) 99999-8888.',
      });
      return;
    }

    setSubmitting(true);
    try {
      // Grava o telefone no perfil para nunca mais pedir.
      let phoneToUse = appUser.phone ?? null;
      if (showWhatsapp) {
        const stored = toStoredPhone(phone);
        if (stored !== appUser.phone) {
          await updateDoc(doc(db, 'users', firebaseUser.uid), { phone: stored });
          await refreshUser();
        }
        phoneToUse = stored;
      }

      const postId = await createQuemAnimaPost({
        authorId: firebaseUser.uid,
        authorFirstName: appUser.firstName || 'Alguém',
        courtId,
        format,
        dateISO,
        timeMode,
        startAt: timeMode === 'fixed' ? startDate : null,
        description,
        showWhatsapp,
        whatsappPhone: phoneToUse,
        allowComments,
        confirmedUserIds: selected.map((s) => s.id),
      });

      showToast({
        variant: 'success',
        title: 'Post publicado!',
        description:
          timeMode === 'fixed'
            ? 'O horário ficou reservado na agenda enquanto você organiza.'
            : 'A galera vai ser avisada.',
      });
      router.replace({ pathname: '/quem-anima/[id]', params: { id: postId } });
    } catch (e) {
      // createQuemAnimaPost propaga o erro de validação da reserva já amigável.
      const message = e instanceof Error ? e.message : 'Tente novamente.';
      showToast({ variant: 'error', title: 'Não foi possível publicar', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Procurar jogadores' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Formato */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>QUERO JOGAR</Text>
          <View style={styles.formatRow}>
            {FORMATS.map((f) => {
              const active = format === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.formatCard, active && styles.formatCardActive]}
                  onPress={() => setFormat(f.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.formatLabel, active && styles.formatLabelActive]}>
                    {f.label}
                  </Text>
                  <Text style={[styles.formatHint, active && styles.formatHintActive]}>
                    {f.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

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
                  <Text style={[styles.chipText, courtId === c.id && styles.chipTextActive]}>
                    {c.name}
                  </Text>
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
                  <Text style={[styles.dayChipNumber, active && styles.chipTextActive]}>
                    {d.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Horário */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HORÁRIO</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segment, timeMode === 'fixed' && styles.segmentActive]}
              onPress={() => setTimeMode('fixed')}
            >
              <Ionicons
                name="time-outline"
                size={16}
                color={timeMode === 'fixed' ? '#ffffff' : '#6b7280'}
              />
              <Text style={[styles.segmentText, timeMode === 'fixed' && styles.segmentTextActive]}>
                Hora marcada
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, timeMode === 'tbd' && styles.segmentActive]}
              onPress={() => setTimeMode('tbd')}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={16}
                color={timeMode === 'tbd' ? '#ffffff' : '#6b7280'}
              />
              <Text style={[styles.segmentText, timeMode === 'tbd' && styles.segmentTextActive]}>
                A combinar
              </Text>
            </TouchableOpacity>
          </View>

          {timeMode === 'fixed' ? (
            <>
              <WheelTimePicker
                hours={HOURS}
                minutes={MINUTES}
                hour={hour}
                minute={minute}
                onChange={(h, m) => {
                  setHour(h);
                  setMinute(m);
                }}
              />
              <View style={styles.infoBox}>
                <Ionicons name="lock-closed-outline" size={15} color="#6b7280" />
                <Text style={styles.infoBoxText}>
                  O horário fica segurado na agenda em cinza enquanto você organiza. Ninguém reserva
                  por cima.
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={15} color="#6b7280" />
              <Text style={styles.infoBoxText}>
                Você fica livre o dia todo e combina o horário nos comentários ou no WhatsApp. Nada
                é reservado na agenda agora.
              </Text>
            </View>
          )}
        </View>

        {/* Recado */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECADO</Text>
          <TextInput
            style={styles.textarea}
            placeholder="Ex.: procuro iniciantes! / se quiser mudar o horário, me avisa"
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={300}
          />
        </View>

        {/* Como falar comigo */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>COMO FALAR COMIGO</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <Ionicons name="chatbubble-outline" size={20} color="#10b981" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Comentários no post</Text>
                <Text style={styles.toggleDescription}>
                  A galera combina por aqui mesmo, dentro do app.
                </Text>
              </View>
              <Switch
                value={allowComments}
                onValueChange={setAllowComments}
                trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
                thumbColor={allowComments ? '#10b981' : '#f3f4f6'}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Meu WhatsApp</Text>
                <Text style={styles.toggleDescription}>
                  {hasSavedPhone
                    ? 'Um botão leva direto pra sua conversa.'
                    : 'Peça uma vez só — depois fica salvo no seu perfil.'}
                </Text>
              </View>
              <Switch
                value={showWhatsapp}
                onValueChange={setShowWhatsapp}
                trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
                thumbColor={showWhatsapp ? '#10b981' : '#f3f4f6'}
              />
            </View>

            {showWhatsapp && (
              <View style={styles.phoneInputWrap}>
                <Ionicons name="call-outline" size={18} color="#9ca3af" />
                <TextInput
                  style={styles.phoneInput}
                  placeholder="(51) 99999-8888"
                  placeholderTextColor="#9ca3af"
                  value={phone}
                  onChangeText={(v) => setPhone(maskPhoneBR(v))}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                {hasSavedPhone && phone === savedPhone && (
                  <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                )}
              </View>
            )}
          </View>

          {noContactMethod && (
            <View style={styles.warnBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#b45309" />
              <Text style={styles.warnBoxText}>
                Ligue pelo menos um dos dois, senão ninguém consegue te responder.
              </Text>
            </View>
          )}
        </View>

        {/* Jogadores já combinados */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>JÁ TENHO ESSES JOGADORES (OPCIONAL)</Text>
          {loadingData ? (
            <ActivityIndicator color="#10b981" style={{ marginVertical: 12 }} />
          ) : (
            <>
              {suggested.length > 0 && <Text style={styles.suggestHint}>Quem você mais joga</Text>}
              {suggested.map((p) => {
                const active = isSelected(p.userId);
                return (
                  <TouchableOpacity
                    key={p.userId}
                    style={[styles.partnerRow, active && styles.partnerRowActive]}
                    onPress={() =>
                      toggle({
                        id: p.userId,
                        name: p.name,
                        initials: p.initials,
                        pictureUrl: p.pictureUrl,
                      })
                    }
                  >
                    <Avatar uri={p.pictureUrl} initials={p.initials} size={38} fontSize={14} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.partnerName}>{p.name}</Text>
                      <Text style={styles.partnerMeta}>
                        {p.count} {p.count === 1 ? 'jogo' : 'jogos'} juntos
                      </Text>
                    </View>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'add-circle-outline'}
                      size={24}
                      color={active ? '#10b981' : '#9ca3af'}
                    />
                  </TouchableOpacity>
                );
              })}

              {selected
                .filter((s) => !suggested.some((p) => p.userId === s.id))
                .map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.partnerRow, styles.partnerRowActive]}
                    onPress={() => toggle(s)}
                  >
                    <Avatar uri={s.pictureUrl} initials={s.initials} size={38} fontSize={14} />
                    <Text style={[styles.partnerName, { flex: 1 }]}>{s.name}</Text>
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  </TouchableOpacity>
                ))}

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
                <TouchableOpacity
                  key={u.id}
                  style={styles.partnerRow}
                  onPress={() => {
                    toggle(u);
                    setSearch('');
                  }}
                >
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

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmBtn, submitting && styles.confirmBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="megaphone-outline" size={20} color="#ffffff" />
              <Text style={styles.confirmBtnText}>Publicar e avisar a galera</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 24, gap: 22 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },

  formatRow: { flexDirection: 'row', gap: 8 },
  formatCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  formatCardActive: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
  formatLabel: { fontSize: 17, fontWeight: '800', color: '#111827' },
  formatLabelActive: { color: '#065f46' },
  formatHint: { fontSize: 11, color: '#9ca3af' },
  formatHintActive: { color: '#059669' },

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

  segmented: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  segmentActive: { backgroundColor: '#10b981' },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  segmentTextActive: { color: '#ffffff' },

  infoBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  infoBoxText: { flex: 1, fontSize: 12, color: '#6b7280', lineHeight: 17 },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
  },
  warnBoxText: { flex: 1, fontSize: 12, color: '#b45309', lineHeight: 17 },

  textarea: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 84,
    textAlignVertical: 'top',
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    gap: 12,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  toggleDescription: { fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#f3f4f6' },
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
  },
  phoneInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#111827' },

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
