import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { COURTS } from '@/lib/courts';

export default function MinhasQuadrasScreen() {
  const { firebaseUser, appUser, refreshUser } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();
  const { showError, showSuccess } = useToast();

  const viewedUserId = userId || firebaseUser?.uid || '';
  const isMe = !userId || userId === firebaseUser?.uid;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!viewedUserId) return;
    setLoading(true);
    setError(false);
    try {
      // No próprio perfil o doc já está em memória; em outro perfil precisa buscar.
      const courtIds: string[] = isMe
        ? appUser?.courtIds ?? []
        : (await getDoc(doc(db, 'users', viewedUserId))).data()?.courtIds ?? [];
      setSelected(new Set(courtIds));
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [viewedUserId, isMe, appUser?.courtIds]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    if (!isMe) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!isMe || selected.size === 0 || !firebaseUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        courtIds: Array.from(selected),
      });
      await refreshUser();
      showSuccess('Quadras salvas!', 'A agenda e o feed já seguem a sua escolha.');
      router.back();
    } catch (e) {
      showError(e, 'Não foi possível salvar as quadras');
    } finally {
      setSaving(false);
    }
  };

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
        <Text style={styles.errorText}>Não foi possível carregar as quadras.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isMe && (
        <Text style={styles.hint}>
          Escolha as quadras onde você joga. A agenda, o feed e os avisos do "Quem anima?"
          passam a mostrar só o que acontece nelas.
        </Text>
      )}

      <View style={styles.list}>
        {COURTS.map((court) => {
          const isSelected = selected.has(court.id);
          return (
            <TouchableOpacity
              key={court.id}
              style={[styles.courtRow, isSelected && styles.courtRowSelected]}
              onPress={() => toggle(court.id)}
              disabled={!isMe}
              activeOpacity={isMe ? 0.7 : 1}
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
      </View>

      {isMe && (
        <>
          <TouchableOpacity
            style={[styles.saveBtn, (selected.size === 0 || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={selected.size === 0 || saving}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Salvar</Text>
            )}
          </TouchableOpacity>
          {selected.size === 0 && (
            <Text style={styles.footNote}>Escolha pelo menos uma quadra para salvar.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  hint: { fontSize: 13, color: '#6b7280', lineHeight: 18 },

  list: { gap: 10 },
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

  saveBtn: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  footNote: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
});
