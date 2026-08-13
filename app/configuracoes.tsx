import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { maskPhoneBR, isValidPhoneBR, toStoredPhone, fromStoredPhone } from '@/lib/phone';

interface ToggleRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ icon, title, description, value, onChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <Ionicons name={icon} size={20} color="#10b981" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
        thumbColor={value ? '#10b981' : '#f3f4f6'}
      />
    </View>
  );
}

export default function ConfiguracoesScreen() {
  const { firebaseUser, appUser, refreshUser } = useAuth();
  const { showError, showToast } = useToast();

  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [notifyQuemAnima, setNotifyQuemAnima] = useState(true);
  const [notifyComments, setNotifyComments] = useState(true);
  const [notifyChallenges, setNotifyChallenges] = useState(true);

  // Preferências são opt-out: ausente no doc significa ligado.
  useEffect(() => {
    if (!appUser) return;
    setPhone(fromStoredPhone(appUser.phone));
    setNotifyQuemAnima(appUser.notifyQuemAnima !== false);
    setNotifyComments(appUser.notifyComments !== false);
    setNotifyChallenges(appUser.notifyChallenges !== false);
  }, [appUser]);

  const storedPhone = fromStoredPhone(appUser?.phone);
  const phoneChanged = phone !== storedPhone;

  const updatePref = async (field: string, value: boolean, revert: (v: boolean) => void) => {
    if (!firebaseUser) return;
    revert(value);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), { [field]: value });
      await refreshUser();
    } catch (e) {
      revert(!value);
      showError(e, 'Não foi possível salvar');
    }
  };

  const savePhone = async () => {
    if (!firebaseUser) return;
    const empty = phone.trim() === '';
    if (!empty && !isValidPhoneBR(phone)) {
      showToast({
        variant: 'error',
        title: 'Número incompleto',
        description: 'Digite DDD + número, ex.: (51) 99999-8888.',
      });
      return;
    }
    setSavingPhone(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        phone: empty ? null : toStoredPhone(phone),
      });
      await refreshUser();
      showToast({
        variant: 'success',
        title: empty ? 'Telefone removido' : 'Telefone salvo!',
        description: empty ? undefined : 'Não vamos pedir de novo.',
      });
    } catch (e) {
      showError(e, 'Não foi possível salvar o telefone');
    } finally {
      setSavingPhone(false);
    }
  };

  if (!appUser) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Configurações' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* WhatsApp */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WhatsApp</Text>
          <View style={styles.card}>
            <Text style={styles.cardHint}>
              Salve seu número uma vez. Depois é só marcar a opção de contato ao criar um post do
              "Quem anima?" — a gente nunca mais pergunta.
            </Text>
            <View style={styles.phoneRow}>
              <View style={styles.phoneInputWrap}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <TextInput
                  style={styles.phoneInput}
                  placeholder="(51) 99999-8888"
                  placeholderTextColor="#9ca3af"
                  value={phone}
                  onChangeText={(v) => setPhone(maskPhoneBR(v))}
                  keyboardType="phone-pad"
                  maxLength={15}
                  editable={!savingPhone}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, (!phoneChanged || savingPhone) && styles.saveBtnDisabled]}
                onPress={savePhone}
                disabled={!phoneChanged || savingPhone}
              >
                {savingPhone ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
            {!!appUser.phone && !phoneChanged && (
              <View style={styles.savedHint}>
                <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                <Text style={styles.savedHintText}>Número salvo</Text>
              </View>
            )}
          </View>
        </View>

        {/* Notificações */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificações</Text>
          <View style={styles.card}>
            <ToggleRow
              icon="megaphone-outline"
              title="Quem anima?"
              description="Avisar quando alguém publicar que está procurando jogadores."
              value={notifyQuemAnima}
              onChange={(v) => updatePref('notifyQuemAnima', v, setNotifyQuemAnima)}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="chatbubble-outline"
              title="Comentários"
              description="Avisar quando comentarem em um post que você criou ou animou."
              value={notifyComments}
              onChange={(v) => updatePref('notifyComments', v, setNotifyComments)}
            />
            <View style={styles.divider} />
            <ToggleRow
              icon="trophy-outline"
              title="Desafios"
              description="Avisar quando alguém te desafiar para um jogo."
              value={notifyChallenges}
              onChange={(v) => updatePref('notifyChallenges', v, setNotifyChallenges)}
            />
          </View>
          <Text style={styles.footNote}>
            Avisos sobre os seus próprios posts — alguém animou, você foi adicionado ao jogo —
            chegam sempre.
          </Text>
        </View>

        {/* Atribuição exigida pela licença CC BY 4.0 da Open-Meteo. */}
        <TouchableOpacity
          onPress={() => WebBrowser.openBrowserAsync('https://open-meteo.com/')}
          activeOpacity={0.7}
        >
          <Text style={styles.credit}>Dados meteorológicos por Open-Meteo.com</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40, gap: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  cardHint: { fontSize: 13, color: '#6b7280', lineHeight: 18 },

  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  phoneInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  phoneInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#111827' },
  saveBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    minWidth: 84,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  savedHint: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  savedHintText: { fontSize: 12, color: '#10b981', fontWeight: '600' },

  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  toggleDescription: { fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#f3f4f6' },
  footNote: { fontSize: 12, color: '#9ca3af', lineHeight: 17, paddingHorizontal: 4 },
  credit: { fontSize: 11, color: '#9ca3af', textAlign: 'center', textDecorationLine: 'underline' },
});
