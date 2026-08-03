import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  limit,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: Date;
  /** Quando presente, tocar na notificação abre o post do "Quem anima?". */
  quemAnimaPostId?: string | null;
}

const ICON_BY_TYPE: Record<string, keyof typeof Ionicons.glyphMap> = {
  challenge: 'trophy-outline',
  quem_anima_novo: 'megaphone-outline',
  quem_anima_interesse: 'hand-right-outline',
  quem_anima_comentario: 'chatbubble-outline',
  quem_anima_adicionado: 'checkmark-done',
};

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)} dias`;
}

export default function NotificacoesScreen() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseUser) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUserId', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    getDocs(q).then((snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        type: d.data().type ?? 'info',
        message: d.data().message ?? '',
        read: d.data().read === true,
        createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
        quemAnimaPostId: d.data().quemAnimaPostId ?? null,
      }));
      setNotifications(items);
      // Mark all as read
      snap.docs.filter((d) => !d.data().read).forEach((d) =>
        updateDoc(doc(db, 'notifications', d.id), { read: true })
      );
      setLoading(false);
    });
  }, [firebaseUser]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#10b981" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>Nenhuma notificação.</Text>
        </View>
      ) : (
        notifications.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.card, !n.read && styles.cardUnread]}
            onPress={() =>
              n.quemAnimaPostId &&
              router.push({ pathname: '/quem-anima/[id]', params: { id: n.quemAnimaPostId } })
            }
            activeOpacity={n.quemAnimaPostId ? 0.7 : 1}
            disabled={!n.quemAnimaPostId}
          >
            <View style={styles.cardLeft}>
              <Ionicons
                name={ICON_BY_TYPE[n.type] ?? 'notifications-outline'}
                size={20}
                color={n.read ? '#9ca3af' : '#10b981'}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardText, !n.read && styles.cardTextUnread]}>{n.message}</Text>
              <Text style={styles.cardTime}>{timeAgo(n.createdAt)}</Text>
            </View>
            {n.quemAnimaPostId && (
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            )}
            {!n.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardUnread: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  cardLeft: { paddingTop: 2 },
  cardBody: { flex: 1 },
  cardText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  cardTextUnread: { fontWeight: '600', color: '#111827' },
  cardTime: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginTop: 4,
  },
});
