/**
 * Último passo antes de entrar no app: escolher em quais quadras a pessoa joga.
 *
 * Espelha `quadra-tenis-igrejinha/src/app/(auth)/select-court/page.tsx`. Quem chega
 * aqui é quem já tem nome no perfil mas ainda está sem `courtIds` — na prática,
 * conta recém-criada. O AuthGuard em `app/_layout.tsx` faz esse desvio, igual ao
 * `src/app/(app)/layout.tsx` do web.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import ErrorState from '@/components/ErrorState';
import { getFriendlyError, FriendlyError } from '@/lib/errors';
import { COURTS } from '@/lib/courts';

/** Deve casar com o fade da entrada de (tabs) em app/_layout.tsx. */
const FADE_OUT_MS = 420;

interface CourtOption {
  id: string;
  name: string;
}

export default function SelecionarQuadraScreen() {
  const { firebaseUser, refreshUser } = useAuth();
  const { showError } = useToast();

  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  const opacity = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'courts'));
      const list: CourtOption[] = snap.docs
        .map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // Se a coleção ainda não tiver nome nos docs, o registro estático salva a tela.
      setCourts(list.length ? list : COURTS.map((c) => ({ id: c.id, name: c.name })));
    } catch (e) {
      console.error(e);
      setError(getFriendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courts;
    return courts.filter((c) => c.name.toLowerCase().includes(term));
  }, [courts, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEnter = async () => {
    if (selected.size === 0 || !firebaseUser) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'users', firebaseUser.uid),
        { courtIds: Array.from(selected) },
        { merge: true }
      );
      // Some suavemente antes de o AuthGuard trocar pra (tabs), que entra em fade.
      opacity.value = withTiming(0, { duration: FADE_OUT_MS });
      setTimeout(async () => {
        try {
          await refreshUser();
        } catch (e) {
          // Sem isso a tela ficaria invisível e travada: volta a aparecer para
          // a pessoa poder tentar de novo.
          opacity.value = withTiming(1, { duration: 200 });
          showError(e, 'Quadras salvas, mas não foi possível entrar');
          setSaving(false);
        }
      }, FADE_OUT_MS);
    } catch (e) {
      showError(e, 'Não foi possível salvar as quadras');
      setSaving(false);
    }
  };

  const entrarLabel = saving
    ? 'Entrando...'
    : selected.size === 0
    ? 'Selecione ao menos uma quadra'
    : selected.size > 1
    ? `Entrar (${selected.size} quadras)`
    : 'Entrar';

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Text style={styles.title}>Escolha sua quadra</Text>
            <Text style={styles.subtitle}>
              Selecione uma ou mais quadras em que você joga. A agenda e o feed passam a
              mostrar só o que acontece nelas.
            </Text>
          </Animated.View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar quadra..."
              placeholderTextColor="#9ca3af"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              editable={!saving}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.listWrap}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#10b981" />
              </View>
            ) : error ? (
              <ErrorState error={error} onRetry={load} />
            ) : filtered.length === 0 ? (
              <View style={styles.center}>
                <Ionicons name="tennisball-outline" size={32} color="#d1d5db" />
                <Text style={styles.emptyText}>Nenhuma quadra encontrada</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filtered.map((court) => {
                  const isSelected = selected.has(court.id);
                  return (
                    <TouchableOpacity
                      key={court.id}
                      style={[styles.courtRow, isSelected && styles.courtRowSelected]}
                      onPress={() => toggle(court.id)}
                      activeOpacity={0.7}
                      disabled={saving}
                    >
                      <Ionicons
                        name="tennisball-outline"
                        size={20}
                        color={isSelected ? '#059669' : '#9ca3af'}
                      />
                      <Text style={[styles.courtName, isSelected && styles.courtNameSelected]}>
                        {court.name}
                      </Text>
                      {isSelected && (
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.enterBtn,
              (selected.size === 0 || saving || !!error) && styles.enterBtnDisabled,
            ]}
            onPress={handleEnter}
            disabled={selected.size === 0 || saving || !!error}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.enterBtnText}>{entrarLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ecfdf5' },
  flex: { flex: 1 },
  content: { flex: 1, padding: 24, gap: 16 },

  header: { alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#111827' },

  listWrap: { flex: 1 },
  list: { gap: 10, paddingBottom: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  courtRowSelected: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  courtName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },
  courtNameSelected: { color: '#047857' },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },

  enterBtn: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  enterBtnDisabled: { opacity: 0.4 },
  enterBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
});
