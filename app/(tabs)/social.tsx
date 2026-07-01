import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PostContent from '@/components/PostContent';
import PhotoViewer from '@/components/PhotoViewer';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { getUserStats } from '@/lib/stats';

type Tab = 'feed' | 'ranking' | 'quem-anima';

interface PostAuthor {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
}

interface PostItem {
  id: string;
  authorId: string;
  author: PostAuthor;
  content: string;
  imageUrl?: string | null;
  createdAt: Date;
  likeCount: number;
  likedByMe: boolean;
  likedByUserIds: string[];
  commentCount: number;
}

interface RankingEntry {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
  hours: number;
}

interface Partner {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
  count: number;
}

function getInitials(firstName: string, lastName?: string): string {
  return `${(firstName || 'U')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

function timeAgo(date: Date): string {
  const s = (Date.now() - date.getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 604800) return `há ${Math.floor(s / 86400)} dias`;
  return date.toLocaleDateString('pt-BR');
}

async function buildAuthor(authorId: string): Promise<PostAuthor> {
  const snap = await getDoc(doc(db, 'users', authorId));
  if (snap.exists()) {
    const u = snap.data();
    const name = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Usuário';
    return { id: authorId, name, initials: getInitials(u?.firstName, u?.lastName), pictureUrl: u?.pictureUrl };
  }
  return { id: authorId, name: 'Usuário', initials: 'U' };
}

async function loadPosts(currentUserId: string): Promise<PostItem[]> {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  const authorIds = [...new Set(snap.docs.map((d) => d.data().authorId as string))];
  const authorDocs = await Promise.all(authorIds.map((id) => getDoc(doc(db, 'users', id))));
  const authorsMap: Record<string, PostAuthor> = {};
  authorDocs.forEach((d) => {
    if (d.exists()) {
      const u = d.data();
      const name = `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Usuário';
      authorsMap[d.id] = { id: d.id, name, initials: getInitials(u?.firstName, u?.lastName), pictureUrl: u?.pictureUrl };
    }
  });
  return snap.docs.map((d) => {
    const data = d.data();
    const likedByUserIds: string[] = data.likedByUserIds ?? [];
    return {
      id: d.id,
      authorId: data.authorId,
      author: authorsMap[data.authorId] ?? { id: data.authorId, name: 'Usuário', initials: 'U' },
      content: data.content ?? '',
      imageUrl: data.imageUrl ?? null,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      likeCount: data.likeCount ?? 0,
      likedByMe: likedByUserIds.includes(currentUserId),
      likedByUserIds,
      commentCount: data.commentCount ?? 0,
    };
  });
}

// ---------- Feed Tab ----------
function FeedTab({ currentUserId }: { currentUserId: string }) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const { showError, showSuccess } = useToast();

  const load = useCallback(async () => {
    try {
      const p = await loadPosts(currentUserId);
      setPosts(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const publish = async () => {
    if (!newPost.trim()) return;
    try {
      setPublishing(true);
      await addDoc(collection(db, 'posts'), {
        authorId: currentUserId,
        content: newPost.trim(),
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0,
        likedByUserIds: [],
      });
      setNewPost('');
      await load();
    } catch (e) { showError(e, 'Erro ao publicar'); }
    finally { setPublishing(false); }
  };

  const toggleLike = async (post: PostItem) => {
    const ref = doc(db, 'posts', post.id);
    if (post.likedByMe) {
      await updateDoc(ref, { likedByUserIds: arrayRemove(currentUserId), likeCount: increment(-1) });
    } else {
      await updateDoc(ref, { likedByUserIds: arrayUnion(currentUserId), likeCount: increment(1) });
    }
    setPosts((prev) => prev.map((p) =>
      p.id === post.id
        ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (post.likedByMe ? -1 : 1) }
        : p
    ));
  };

  const deletePost = async (postId: string) => {
    Alert.alert('Excluir post', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, 'posts', postId));
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={feedStyles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* New post */}
        <View style={feedStyles.newPostCard}>
          <TextInput
            style={feedStyles.newPostInput}
            placeholder="O que está acontecendo?"
            placeholderTextColor="#9ca3af"
            value={newPost}
            onChangeText={setNewPost}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[feedStyles.publishBtn, (!newPost.trim() || publishing) && feedStyles.publishBtnDisabled]}
            onPress={publish}
            disabled={!newPost.trim() || publishing}
          >
            {publishing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={feedStyles.publishBtnText}>Publicar</Text>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#10b981" style={{ marginTop: 32 }} />
        ) : posts.length === 0 ? (
          <View style={feedStyles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={feedStyles.emptyText}>Nenhuma postagem ainda.</Text>
          </View>
        ) : (
          posts.map((post) => (
            <View key={post.id} style={feedStyles.postCard}>
              <View style={feedStyles.postHeader}>
                <Avatar uri={post.author.pictureUrl} initials={post.author.initials} size={38} fontSize={14} />
                <View style={{ flex: 1 }}>
                  <Text style={feedStyles.authorName}>{post.author.name}</Text>
                  <Text style={feedStyles.postTime}>{timeAgo(post.createdAt)}</Text>
                </View>
                {post.authorId === currentUserId && (
                  <TouchableOpacity onPress={() => deletePost(post.id)}>
                    <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>

              <PostContent content={post.content} style={feedStyles.postContent} />

              {post.imageUrl && (
                <TouchableOpacity onPress={() => setSelectedPhoto(post.imageUrl!)} activeOpacity={0.92}>
                  <Image source={{ uri: post.imageUrl }} style={feedStyles.postImage} resizeMode="cover" />
                </TouchableOpacity>
              )}

              <View style={feedStyles.postActions}>
                <TouchableOpacity style={feedStyles.action} onPress={() => toggleLike(post)}>
                  <Ionicons
                    name={post.likedByMe ? 'heart' : 'heart-outline'}
                    size={18}
                    color={post.likedByMe ? '#ef4444' : '#9ca3af'}
                  />
                  {post.likeCount > 0 && (
                    <Text style={[feedStyles.actionCount, post.likedByMe && { color: '#ef4444' }]}>
                      {post.likeCount}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={feedStyles.action}>
                  <Ionicons name="chatbubble-outline" size={18} color="#9ca3af" />
                  {post.commentCount > 0 && (
                    <Text style={feedStyles.actionCount}>{post.commentCount}</Text>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <PhotoViewer
        uri={selectedPhoto}
        visible={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </KeyboardAvoidingView>
  );
}

// ---------- Ranking Tab ----------
function RankingTab() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), limit(50)));
        const entries: RankingEntry[] = [];
        for (const d of snap.docs) {
          const u = d.data();
          if (u?.isAnonymous) continue;
          const stats = await getUserStats(d.id);
          entries.push({
            id: d.id,
            name: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Jogador',
            initials: getInitials(u?.firstName, u?.lastName),
            pictureUrl: u?.pictureUrl,
            hours: stats.totalHours,
          });
        }
        setRanking(entries.sort((a, b) => b.hours - a.hours));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <ActivityIndicator color="#10b981" style={{ marginTop: 32 }} />;

  return (
    <ScrollView contentContainerStyle={rankingStyles.content}>
      {ranking.map((entry, i) => (
        <View key={entry.id} style={rankingStyles.row}>
          <Text style={rankingStyles.rank}>#{i + 1}</Text>
          <Avatar uri={entry.pictureUrl} initials={entry.initials} size={36} />
          <Text style={rankingStyles.name}>{entry.name}</Text>
          <Text style={rankingStyles.hours}>{entry.hours}h</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ---------- Quem Anima Tab ----------
function QuemAnimaTab({ currentUserId }: { currentUserId: string }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stats = await getUserStats(currentUserId);
        setPartners(
          stats.topPartners.map((p) => ({
            id: p.userId,
            name: p.name,
            initials: p.initials,
            pictureUrl: p.pictureUrl,
            count: p.count,
          }))
        );
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [currentUserId]);

  if (loading) return <ActivityIndicator color="#10b981" style={{ marginTop: 32 }} />;

  return (
    <ScrollView contentContainerStyle={quemStyles.content}>
      <Text style={quemStyles.hint}>Seus parceiros mais frequentes</Text>
      {partners.length === 0 ? (
        <View style={quemStyles.empty}>
          <Ionicons name="people-outline" size={48} color="#d1d5db" />
          <Text style={quemStyles.emptyText}>Faça reservas para ver seus parceiros aqui.</Text>
        </View>
      ) : (
        partners.map((p) => (
          <View key={p.id} style={quemStyles.row}>
            <Avatar uri={p.pictureUrl} initials={p.initials} size={36} />
            <Text style={quemStyles.name}>{p.name}</Text>
            <Text style={quemStyles.count}>{p.count} {p.count === 1 ? 'jogo' : 'jogos'}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ---------- Main Social Screen ----------
export default function SocialScreen() {
  const { firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('feed');

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'feed', label: 'Feed', icon: 'list-outline' },
    { key: 'ranking', label: 'Ranking', icon: 'trophy-outline' },
    { key: 'quem-anima', label: 'Quem Anima', icon: 'time-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Ionicons
              name={t.icon}
              size={16}
              color={activeTab === t.key ? '#059669' : '#9ca3af'}
            />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'feed' && <FeedTab currentUserId={firebaseUser?.uid ?? ''} />}
      {activeTab === 'ranking' && <RankingTab />}
      {activeTab === 'quem-anima' && <QuemAnimaTab currentUserId={firebaseUser?.uid ?? ''} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#10b981' },
  tabLabel: { fontSize: 13, fontWeight: '500', color: '#9ca3af' },
  tabLabelActive: { color: '#059669', fontWeight: '700' },
});

const feedStyles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  newPostCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  newPostInput: {
    fontSize: 14,
    color: '#111827',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  publishBtn: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
  },
  publishBtnDisabled: { opacity: 0.4 },
  publishBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  postTime: { fontSize: 12, color: '#9ca3af' },
  postContent: { fontSize: 14, color: '#374151', lineHeight: 20 },
  postImage: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f3f4f6' },
  postActions: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
});

const rankingStyles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 32 },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rank: { fontSize: 14, fontWeight: '700', color: '#9ca3af', width: 28 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  hours: { fontSize: 14, fontWeight: '700', color: '#10b981' },
});

const quemStyles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  count: { fontSize: 13, color: '#6b7280' },
});
