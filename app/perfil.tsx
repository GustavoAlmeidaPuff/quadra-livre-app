import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

export default function PerfilScreen() {
  const { appUser, firebaseUser } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sair', 'Deseja sair da conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => signOut(auth),
      },
    ]);
  };

  const fullName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(' ');
  const initials = fullName
    ? fullName
        .split(' ')
        .filter((_, i, arr) => i === 0 || i === arr.length - 1)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : '?';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & Name */}
      <View style={styles.profileHeader}>
        {appUser?.pictureUrl ? (
          <Image source={{ uri: appUser.pictureUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <Text style={styles.name}>{fullName || 'Usuário'}</Text>
        <Text style={styles.email}>{appUser?.email ?? firebaseUser?.email ?? ''}</Text>
      </View>

      {/* Info cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conta</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color="#6b7280" />
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>{fullName || '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={18} color="#6b7280" />
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {appUser?.email ?? firebaseUser?.email ?? '—'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
            <Text style={styles.infoLabel}>Perfil</Text>
            <Text style={styles.infoValue}>
              {appUser?.isPrivate ? 'Privado' : 'Público'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.signOutText}>Sair da conta</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  profileHeader: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 28 },
  name: { fontSize: 22, fontWeight: '800', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  infoLabel: { fontSize: 14, color: '#374151', flex: 1 },
  infoValue: { fontSize: 14, color: '#6b7280', maxWidth: '50%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginHorizontal: 14 },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
});
