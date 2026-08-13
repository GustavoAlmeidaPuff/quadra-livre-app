import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getUserStats, UserStats, ReservationListItem } from '@/lib/stats';
import { notifyUsers } from '@/lib/notifications';
import { maskPhoneBR, isValidPhoneBR, toStoredPhone, fromStoredPhone } from '@/lib/phone';
import { getCourtName } from '@/lib/courts';
import { User } from '@/types';
import PhotoViewer from '@/components/PhotoViewer';
import Avatar from '@/components/Avatar';
import PublicProfileHighlights from '@/components/PublicProfileHighlights';
import { getHoursRanking } from '@/lib/ranking';

function DesafioModal({
  visible,
  targetName,
  savedPhone,
  onClose,
  onSubmit,
  sending,
}: {
  visible: boolean;
  targetName: string;
  /** Telefone já salvo no perfil (formato de exibição BR), se houver. */
  savedPhone: string;
  onClose: () => void;
  onSubmit: (phone: string) => void;
  sending: boolean;
}) {
  const [phone, setPhone] = useState(savedPhone);
  useEffect(() => {
    if (visible) setPhone(savedPhone);
  }, [visible, savedPhone]);

  const needsPhone = !savedPhone;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={modalStyles.modal}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Desafiar {targetName}</Text>
            <TouchableOpacity onPress={onClose} disabled={sending}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {needsPhone ? (
            <>
              <Text style={modalStyles.modalText}>
                Precisamos do seu WhatsApp para {targetName} poder combinar o jogo com você.
              </Text>
              <View style={modalStyles.phoneInputWrap}>
                <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                <TextInput
                  style={modalStyles.phoneInput}
                  placeholder="(51) 99999-8888"
                  placeholderTextColor="#9ca3af"
                  value={phone}
                  onChangeText={(v) => setPhone(maskPhoneBR(v))}
                  keyboardType="phone-pad"
                />
              </View>
            </>
          ) : (
            <Text style={modalStyles.modalText}>
              Vamos avisar {targetName} para falar com você no WhatsApp ({savedPhone}).
            </Text>
          )}

          <View style={modalStyles.modalActions}>
            <TouchableOpacity
              style={[modalStyles.actionBtn, modalStyles.desafiarBtn, sending && modalStyles.disabledBtn]}
              onPress={() => onSubmit(phone)}
              disabled={sending}
            >
              <Ionicons name="trophy-outline" size={18} color="#fff" />
              <Text style={modalStyles.actionBtnText}>{sending ? 'Enviando...' : 'Enviar desafio'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReservationDetailModal({
  item,
  onClose,
  canManage,
  onCancel,
  onLeave,
  busy,
}: {
  item: ReservationListItem | null;
  onClose: () => void;
  canManage: boolean;
  onCancel: (id: string) => void;
  onLeave: (id: string) => void;
  busy: boolean;
}) {
  if (!item) return null;
  const isCreator = canManage;
  const hasMultiple = item.participants.length > 1;

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.modal}>
          <View style={modalStyles.modalHeader}>
            <Text style={modalStyles.modalTitle}>Detalhes da reserva</Text>
            <TouchableOpacity onPress={onClose} disabled={busy}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={modalStyles.modalRow}>
            <Ionicons name="calendar-outline" size={16} color="#10b981" />
            <Text style={modalStyles.modalText}>{item.dateLabel}</Text>
          </View>
          <View style={modalStyles.modalRow}>
            <Ionicons name="time-outline" size={16} color="#10b981" />
            <Text style={modalStyles.modalText}>{item.time}</Text>
          </View>
          {item.participants.length > 0 && (
            <View style={modalStyles.modalRow}>
              <Ionicons name="people-outline" size={16} color="#10b981" />
              <Text style={modalStyles.modalText}>{item.participants.join(', ')}</Text>
            </View>
          )}

          <View style={modalStyles.modalActions}>
            {!isCreator && hasMultiple && (
              <TouchableOpacity
                style={[modalStyles.actionBtn, modalStyles.leaveBtn, busy && modalStyles.disabledBtn]}
                onPress={() => onLeave(item.id)}
                disabled={busy}
              >
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={modalStyles.actionBtnText}>{busy ? 'Aguarde...' : 'Sair da reserva'}</Text>
              </TouchableOpacity>
            )}
            {isCreator && (
              <TouchableOpacity
                style={[modalStyles.actionBtn, modalStyles.cancelBtn, busy && modalStyles.disabledBtn]}
                onPress={() => onCancel(item.id)}
                disabled={busy}
              >
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={modalStyles.actionBtnText}>{busy ? 'Aguarde...' : 'Cancelar reserva'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Mesmo contato de suporte usado na versão web. */
const SUPPORT_WHATSAPP =
  'https://wa.me/5551997188572?text=Ol%C3%A1%21%20preciso%20de%20ajuda%20no%20app%20de%20reservar%20horarios%20na%20quadra%2C%20por%20favor%21';

function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName || 'U')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

export default function PerfilScreen() {
  const { appUser, firebaseUser, refreshUser } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const router = useRouter();

  // Se não passou userId, mostra o próprio perfil
  const viewedUserId = userId || firebaseUser?.uid || '';
  const isOwnProfile = !userId || userId === firebaseUser?.uid;

  const [profileUser, setProfileUser] = useState<User | null>(isOwnProfile ? appUser : null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationListItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [desafioVisible, setDesafioVisible] = useState(false);
  const [desafioSending, setDesafioSending] = useState(false);
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);
  const [rankingTotal, setRankingTotal] = useState(0);
  const [rankingLoading, setRankingLoading] = useState(!isOwnProfile);

  const loadProfile = useCallback(async () => {
    if (!viewedUserId) return;
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
  }, [viewedUserId, isOwnProfile, appUser]);

  useEffect(() => {
    if (!viewedUserId) return;
    setLoading(true);
    loadProfile();
  }, [viewedUserId, isOwnProfile, appUser]);

  useEffect(() => {
    if (isOwnProfile || !viewedUserId) {
      setRankingPosition(null);
      setRankingTotal(0);
      setRankingLoading(false);
      return;
    }

    let cancelled = false;
    setRankingLoading(true);
    getHoursRanking()
      .then(({ entries }) => {
        if (cancelled) return;
        const index = entries.findIndex((entry) => entry.id === viewedUserId);
        setRankingPosition(index >= 0 ? index + 1 : null);
        setRankingTotal(entries.length);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setRankingPosition(null);
          setRankingTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, viewedUserId]);

  const handleCancelReservation = (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert('Cancelar reserva', 'Isso vai cancelar a reserva para todos os participantes. Deseja continuar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar reserva',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
          try {
            const partSnap = await getDocs(
              query(collection(db, 'reservationParticipants'), where('reservationId', '==', reservationId))
            );
            const batch = writeBatch(db);
            partSnap.docs.forEach((d) => batch.delete(d.ref));
            batch.delete(doc(db, 'reservations', reservationId));
            await batch.commit();
            setSelectedReservation(null);
            loadProfile();
          } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível cancelar a reserva.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleLeaveReservation = (reservationId: string) => {
    if (!firebaseUser) return;
    Alert.alert('Sair da reserva', 'Tem certeza que deseja sair desta reserva?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setActionBusy(true);
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
            setSelectedReservation(null);
            loadProfile();
          } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Não foi possível sair da reserva.');
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleSendChallenge = async (typedPhone: string) => {
    if (!firebaseUser || !appUser || !profileUser) return;

    let phoneToUse = appUser.phone ?? null;
    if (!phoneToUse) {
      if (!isValidPhoneBR(typedPhone)) {
        Alert.alert('Número incompleto', 'Digite DDD + número, ex.: (51) 99999-8888.');
        return;
      }
      phoneToUse = toStoredPhone(typedPhone);
    }

    setDesafioSending(true);
    try {
      if (phoneToUse !== appUser.phone) {
        await updateDoc(doc(db, 'users', firebaseUser.uid), { phone: phoneToUse });
        await refreshUser();
      }
      const fromName = appUser.firstName || 'Alguém';
      await notifyUsers({
        toUserIds: [profileUser.id],
        type: 'challenge',
        title: 'Novo desafio!',
        message: `${fromName} te desafiou! Toque para falar no WhatsApp e combinar o jogo.`,
        fromUserId: firebaseUser.uid,
        whatsappPhone: phoneToUse,
      });
      setDesafioVisible(false);
      Alert.alert('Desafio enviado!', `${profileUser.firstName || 'A pessoa'} vai receber um aviso.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível enviar o desafio.');
    } finally {
      setDesafioSending(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sair', 'Deseja sair da conta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  };

  const fullName = [profileUser?.firstName, profileUser?.lastName].filter(Boolean).join(' ');
  const initials = getInitials(profileUser?.firstName, profileUser?.lastName);
  // courtIds vazio/ausente = jogador acompanha todas as quadras.
  const myCourtIds = appUser?.courtIds ?? [];
  const selectedCourtsLabel =
    myCourtIds.length > 0 ? myCourtIds.map(getCourtName).join(', ') : 'Todas as quadras';
  const showDesafiar =
    !isOwnProfile && !!firebaseUser && !!profileUser && profileUser.id !== firebaseUser.uid && !profileUser.isPrivate;

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
          <View>
            <Avatar uri={profileUser?.pictureUrl} initials={initials} size={80} fontSize={28} fontWeight="800" />
            {profileUser?.pictureUrl && (
              <View style={styles.avatarZoomHint}>
                <Ionicons name="expand-outline" size={14} color="#ffffff" />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{fullName || 'Usuário'}</Text>
        {isOwnProfile && (
          <Text style={styles.email}>
            {profileUser?.email ?? firebaseUser?.email ?? ''}
          </Text>
        )}
        {showDesafiar && (
          <TouchableOpacity style={styles.desafiarButton} onPress={() => setDesafioVisible(true)}>
            <Ionicons name="trophy-outline" size={16} color="#ffffff" />
            <Text style={styles.desafiarButtonText}>Desafiar</Text>
          </TouchableOpacity>
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

      {!isOwnProfile && stats && (
        <PublicProfileHighlights
          stats={stats}
          rankingPosition={rankingPosition}
          rankingTotal={rankingTotal}
          rankingLoading={rankingLoading}
          onOpenClassification={() =>
            router.push({ pathname: '/classificacao', params: { userId: viewedUserId } })
          }
          onOpenProfile={(partnerId) =>
            router.push({ pathname: '/perfil', params: { userId: partnerId } })
          }
        />
      )}

      {/* Próximas reservas — logo após os números */}
      {isOwnProfile && stats && stats.upcomingReservations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Próximas reservas</Text>
          <View style={styles.reservationList}>
            {stats.upcomingReservations.slice(0, 5).map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.reservationRow}
                onPress={() => setSelectedReservation(r)}
                activeOpacity={0.7}
              >
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
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Estatísticas de jogo (só no próprio perfil) */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push({ pathname: '/estatisticas', params: { userId: viewedUserId } })}
        >
          <Ionicons name="bar-chart-outline" size={20} color="#374151" />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsText}>Estatísticas de jogo</Text>
            <Text style={styles.settingsSub}>Horas por mês, semana e parceiros</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {/* Classificação / patentes (só no próprio perfil, igual ao web) */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push({ pathname: '/classificacao', params: { userId: viewedUserId } })}
        >
          <Ionicons name="trophy-outline" size={20} color="#374151" />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsText}>Classificação</Text>
            <Text style={styles.settingsSub}>Sua patente e o caminho até a próxima</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {/* Minhas quadras (só no próprio perfil) */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/minhas-quadras')}
        >
          <Ionicons name="tennisball-outline" size={20} color="#374151" />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsText}>Minhas quadras</Text>
            <Text style={styles.settingsSub}>
              {selectedCourtsLabel}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {/* Rafitos e Parceiros (só no próprio perfil) */}
      {isOwnProfile && (
        <>
          <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/aulas')}>
            <MaterialCommunityIcons name="tennis" size={20} color="#374151" />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsText}>Evolua no Tênis com Rafitos</Text>
              <Text style={styles.settingsSub}>Aulas, encordamento e acessórios</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/parceiros')}>
            <Ionicons name="people-outline" size={20} color="#374151" />
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsText}>Parceiros do Tênis Regional</Text>
              <Text style={styles.settingsSub}>Quem apoia as quadras parceiras</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        </>
      )}

      {/* Configurações (só no próprio perfil) */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/configuracoes')}
        >
          <Ionicons name="settings-outline" size={20} color="#374151" />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsText}>Configurações</Text>
            <Text style={styles.settingsSub}>Notificações e WhatsApp</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {/* Suporte — última opção, ainda acima das infos da conta */}
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => Linking.openURL(SUPPORT_WHATSAPP)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#059669" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingsText, styles.supportText]}>Falar com suporte</Text>
            <Text style={styles.settingsSub}>Tire dúvidas com a gente no WhatsApp</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}

      {/* Conta (só no próprio perfil) — por último, antes de sair */}
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

      <ReservationDetailModal
        item={selectedReservation}
        onClose={() => setSelectedReservation(null)}
        canManage={selectedReservation?.createdById === firebaseUser?.uid}
        onCancel={handleCancelReservation}
        onLeave={handleLeaveReservation}
        busy={actionBusy}
      />

      {showDesafiar && (
        <DesafioModal
          visible={desafioVisible}
          targetName={profileUser?.firstName || 'a pessoa'}
          savedPhone={fromStoredPhone(appUser?.phone)}
          onClose={() => setDesafioVisible(false)}
          onSubmit={handleSendChallenge}
          sending={desafioSending}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  profileHeader: { alignItems: 'center', gap: 8, paddingVertical: 16 },
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
  desafiarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  desafiarButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

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

  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingsText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  settingsSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  supportText: { color: '#059669' },

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

const modalStyles = StyleSheet.create({
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
  desafiarBtn: { backgroundColor: '#10b981' },
  disabledBtn: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  phoneInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#111827' },
});
