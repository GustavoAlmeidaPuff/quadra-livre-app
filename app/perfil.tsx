import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { getUserStats, UserStats } from '@/lib/stats';
import { User } from '@/types';
import PhotoViewer from '@/components/PhotoViewer';

function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName || 'U')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

export default function PerfilScreen() {
  const { appUser, firebaseUser } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();

  // Se não passou userId, mostra o próprio perfil
  const viewedUserId = userId || firebaseUser?.uid || '';
  const isOwnProfile = !userId || userId === firebaseUser?.uid;

  const [profileUser, setProfileUser] = useState<User | null>(isOwnProfile ? appUser : null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoVisible, setPhotoVisible] = useState(false);

  useEffect(() => {
    if (!viewedUserId) return;
    setLoading(true);

    const loadProfile = async () => {
      try {
        // Carregar dados do usuário se for outro perfil
        if (!isOwnProfile) {
          const snap = await getDoc(doc(db, 'users', viewedUserId));
          if (snap.exists()) {
            setProfileUser({ id: snap.id, ...snap.data() } as User);
          }
        } else {
          setProfileUser(appUser);
        }

        // Carregar stats do usuário visualizado
        const userStats = await getUserStats(viewedUserId);
        setStats(userStats);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [viewedUserId, isOwnProfile, appUser]);

  const handleSignOut = () => {
    Alert.alert('Sair', 'Deseja sair da conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const fullName = [profileUser?.firstName, profileUser?.lastName].filter(Boolean).join(' ');
  const initials = getInitials(profileUser?.firstName, profileUser?.lastName);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar & Name */}
      <View style={styles.profileHeader}>
        <TouchableOpacity
          onPress={() => profileUser?.pictureUrl && setPhotoVisible(true)}
          activeOpacity={profileUser?.pictureUrl ? 0.8 : 1}
        >
          {profileUser?.pictureUrl ? (
            <View>
              <Image source={{ uri: profileUser.pictureUrl }} style={styles.avatar} />
              <View style={styles.avatarZoomHint}>
                <Ionicons name="expand-outline" size={14} color="#ffffff" />
              </View>
            </View>
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.name}>{fullName || 'Usuário'}</Text>
        {isOwnProfile && (
          <Text style={styles.email}>
            {profileUser?.email ?? firebaseUser?.email ?? ''}
          </Text>
        )}
      </View>

      <PhotoViewer
        uri={profileUser?.pictureUrl}
        visible={photoVisible}
        onClose={() => setPhotoVisible(false)}
      />

      {/* Stats */}
      {stats && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={20} color="#10b981" />
            <Text style={styles.statNumber}>{stats.totalHours}h</Text>
            <Text style={styles.statLabel}>Jogadas</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar-outline" size={20} color="#10b981" />
            <Text style={styles.statNumber}>{stats.totalReservations}</Text>
            <Text style={styles.statLabel}>Reservas</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={20} color="#10b981" />
            <Text style={styles.statNumber}>{stats.weekStreak}</Text>
            <Text style={styles.statLabel}>Semanas</Text>
          </View>
        </View>
      )}

      {/* Frequência por dia */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Frequência por dia</Text>
          <View style={styles.chart}>
            {stats.dayStats.map((stat) => {
              const maxCount = Math.max(...stats.dayStats.map((d) => d.count), 1);
              return (
                <View key={stat.day} style={styles.chartBar}>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: stat.count > 0
                            ? Math.max(Math.round((stat.count / maxCount) * 80), 4)
                            : 0,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{stat.day}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Próximas reservas */}
      {isOwnProfile && stats && stats.upcomingReservations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Próximas reservas</Text>
          <View style={styles.reservationList}>
            {stats.upcomingReservations.slice(0, 5).map((r) => (
              <View key={r.id} style={styles.reservationRow}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reservationDate}>{r.dateLabel}</Text>
                  <Text style={styles.reservationTime}>{r.time}</Text>
                  {r.participants.length > 0 && (
                    <Text style={styles.reservationParticipants} numberOfLines={1}>
                      {r.participants.join(', ')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Conta (só no próprio perfil) */}
      {isOwnProfile && (
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
                {profileUser?.email ?? firebaseUser?.email ?? '—'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#6b7280" />
              <Text style={styles.infoLabel}>Perfil</Text>
              <Text style={styles.infoValue}>
                {profileUser?.isPrivate ? 'Privado' : 'Público'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Sign out (só no próprio perfil) */}
      {isOwnProfile && (
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={styles.signOutText}>Sair da conta</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileHeader: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: { backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#ffffff', fontWeight: '800', fontSize: 28 },
  avatarZoomHint: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    padding: 3,
  },
  name: { fontSize: 22, fontWeight: '800', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280' },

  statsGrid: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6b7280', textAlign: 'center' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },

  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  chartBar: { flex: 1, alignItems: 'center', gap: 4 },
  barContainer: { height: 80, justifyContent: 'flex-end', width: '80%' },
  bar: { width: '100%', backgroundColor: '#10b981', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barLabel: { fontSize: 10, color: '#6b7280', fontWeight: '500' },

  reservationList: { gap: 12 },
  reservationRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', marginTop: 5 },
  reservationDate: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reservationTime: { fontSize: 13, color: '#6b7280' },
  reservationParticipants: { fontSize: 12, color: '#059669', marginTop: 2 },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
