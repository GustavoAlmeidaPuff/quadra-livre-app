import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/Avatar';
import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
  getDocs,
  orderBy,
  Timestamp,
  getDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeCourtId, getCourtName, COURTS } from '@/lib/courts';

// ---------- Court Status ----------
interface CourtInfo {
  courtId: string;
  name: string;
  isOccupied: boolean;
  participantNames: string[];
}

async function fetchParticipantNames(reservationId: string): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, 'reservationParticipants'), where('reservationId', '==', reservationId))
  );
  const names: string[] = [];
  for (const d of snap.docs) {
    const { userId, guestName } = d.data();
    if (guestName?.trim()) {
      names.push(guestName.trim());
    } else if (userId) {
      const userSnap = await getDoc(doc(db, 'users', userId));
      const u = userSnap.exists() ? userSnap.data() : {};
      names.push(`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Jogador');
    }
  }
  return names.length > 0 ? names : [];
}

function CourtStatusDot({ isOccupied }: { isOccupied: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.statusDot,
        { backgroundColor: isOccupied ? '#ef4444' : '#10b981', transform: [{ rotate }] },
      ]}
    />
  );
}

function CourtsStatusCenter({ courtIds }: { courtIds: string[] }) {
  const [courts, setCourts] = useState<CourtInfo[]>(
    COURTS.filter((c) => courtIds.includes(c.id)).map((c) => ({
      courtId: c.id,
      name: c.name,
      isOccupied: false,
      participantNames: [],
    }))
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (courtIds.length === 0) return;
    const now = new Date();
    const prev = new Date(now);
    prev.setDate(now.getDate() - 1);
    prev.setHours(0, 0, 0, 0);
    const next = new Date(now);
    next.setDate(now.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'reservations'),
      where('startAt', '>=', Timestamp.fromDate(prev)),
      where('startAt', '<', Timestamp.fromDate(next)),
      orderBy('startAt', 'asc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const nowMs = Date.now();
      const activeCourts = COURTS.filter((c) => courtIds.includes(c.id));
      const updated: CourtInfo[] = await Promise.all(
        activeCourts.map(async (c) => {
          const normId = normalizeCourtId(c.id);
          let occupied = false;
          let names: string[] = [];
          for (const d of snap.docs) {
            const data = d.data();
            if (normalizeCourtId(data.courtId) !== normId) continue;
            // Bloco de organização do "Quem anima?" segura o horário, mas
            // ninguém está jogando ainda — não deixa a quadra "ocupada".
            if (data.type === 'organizing') continue;
            const start = data.startAt.toMillis();
            const end = data.endAt.toMillis();
            if (nowMs >= start && nowMs < end) {
              occupied = true;
              names = await fetchParticipantNames(d.id);
              break;
            }
          }
          return { courtId: c.id, name: getCourtName(c.id), isOccupied: occupied, participantNames: names };
        })
      );
      setCourts(updated);
    });
    return unsub;
  }, [courtIds]);

  if (courts.length === 0) return null;

  const freeCourts = courts.filter((c) => !c.isOccupied);
  const occupiedCourts = courts.filter((c) => c.isOccupied);
  const allFree = occupiedCourts.length === 0;
  const allOccupied = freeCourts.length === 0;
  const mixed = !allFree && !allOccupied;

  let summary: string;
  let subtext: string;
  let occupied: boolean;

  if (allFree) {
    summary = courts.length === 1 ? `${courts[0].name} livre` : `${courts.length} quadras livres`;
    subtext = 'Reserve agora!';
    occupied = false;
  } else if (allOccupied) {
    summary = courts.length === 1 ? `${courts[0].name} ocupada` : `${courts.length} quadras ocupadas`;
    subtext = courts.length === 1
      ? (courts[0].participantNames.slice(0, 2).join(', ') || 'Todas ocupadas')
      : 'Todas ocupadas';
    occupied = true;
  } else {
    const freeLabel = freeCourts.length === 1 ? '1 livre' : `${freeCourts.length} livres`;
    const occLabel = occupiedCourts.length === 1 ? '1 ocupada' : `${occupiedCourts.length} ocupadas`;
    summary = `${freeLabel} · ${occLabel}`;
    subtext = 'Ver detalhes';
    occupied = false;
  }

  return (
    <>
      <TouchableOpacity
        style={styles.courtStatus}
        onPress={() => courts.length > 1 && setDropdownOpen(true)}
        activeOpacity={courts.length > 1 ? 0.7 : 1}
      >
        <CourtStatusDot isOccupied={occupied} />
        <View>
          <Text style={[styles.courtStatusTitle, { color: occupied ? '#dc2626' : '#10b981' }]}>
            {summary}
          </Text>
          <Text style={styles.courtStatusSub} numberOfLines={1}>
            {subtext}
          </Text>
        </View>
        {courts.length > 1 && (
          <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
        )}
      </TouchableOpacity>

      {/* Dropdown */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdown}>
            {courts.map((c) => (
              <View key={c.courtId} style={styles.courtRow}>
                <CourtStatusDot isOccupied={c.isOccupied} />
                <View>
                  <Text style={[styles.courtRowTitle, { color: c.isOccupied ? '#dc2626' : '#10b981' }]}>
                    {c.isOccupied ? `${c.name} ocupada` : `${c.name} livre`}
                  </Text>
                  <Text style={styles.courtRowSub} numberOfLines={1}>
                    {c.isOccupied
                      ? (c.participantNames.length > 2
                        ? `${c.participantNames[0]}, ${c.participantNames[1]} e +${c.participantNames.length - 2}`
                        : c.participantNames.join(', ') || '')
                      : 'Reserve agora!'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------- Main Header ----------
export default function AppHeader() {
  const { appUser, firebaseUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hasUnread, setHasUnread] = useState(false);

  const initials = appUser
    ? `${(appUser.firstName || 'U')[0]}${(appUser.lastName || '')[0] || ''}`.toUpperCase()
    : '?';

  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const uid = firebaseUser.uid;

    const challengeQ = query(
      collection(db, 'challenges'),
      where('toUserId', '==', uid),
      where('status', '==', 'pending')
    );
    const notifQ = query(
      collection(db, 'notifications'),
      where('toUserId', '==', uid),
      where('read', '==', false),
      limit(1)
    );

    const unsub1 = onSnapshot(challengeQ, (snap) => {
      if (snap.docs.some((d) => d.data().viewed !== true)) setHasUnread(true);
      else setHasUnread(false);
    });
    const unsub2 = onSnapshot(notifQ, (snap) => {
      if (snap.docs.length > 0) setHasUnread(true);
    });

    return () => { unsub1(); unsub2(); };
  }, [firebaseUser?.uid]);

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerInner}>
        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => router.push('/perfil')}
        >
          <Avatar uri={appUser?.pictureUrl} initials={initials} size={32} />
          <Ionicons name="chevron-down" size={14} color="#6b7280" />
        </TouchableOpacity>

        {/* Court Status */}
        <CourtsStatusCenter courtIds={appUser?.courtIds ?? ['quadra_1']} />

        {/* Bell */}
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => router.push('/notificacoes')}
        >
          <Ionicons name="notifications-outline" size={22} color="#374151" />
          {hasUnread && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
  },
  avatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  courtStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  courtStatusTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  courtStatusSub: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 14,
  },
  bellBtn: {
    position: 'relative',
    padding: 6,
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
  },
  dropdown: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    minWidth: 220,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  courtRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  courtRowSub: {
    fontSize: 12,
    color: '#9ca3af',
    maxWidth: 160,
  },
});
