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
  Modal,
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
import { useRouter, useFocusEffect } from 'expo-router';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { getSuggestedPartners } from '@/lib/stats';
import { getHoursRanking, HoursRankingEntry } from '@/lib/ranking';
import { listOpenPosts, toggleInterest, QuemAnimaPostView } from '@/lib/quemAnima';

type Tab = 'feed' | 'ranking' | 'quem-anima';

interface PostAuthor {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
}

interface SearchableUser {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
  email?: string;
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

interface CommentItem {
  id: string;
  authorId: string;
  author: PostAuthor;
  content: string;
  createdAt: Date;
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
    // `likedBy` é o nome usado pelo app web e pelas regras do Firestore
    // (que só permitem update com affectedKeys hasOnly(['likedBy'])).
    const likedByUserIds: string[] = data.likedBy ?? [];
    return {
      id: d.id,
      authorId: data.authorId,
      author: authorsMap[data.authorId] ?? { id: data.authorId, name: 'Usuário', initials: 'U' },
      content: data.content ?? '',
      imageUrl: data.imageUrl ?? null,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      likeCount: likedByUserIds.length,
      likedByMe: likedByUserIds.includes(currentUserId),
      likedByUserIds,
      commentCount: data.commentCount ?? 0,
    };
  });
}

async function loadComments(postId: string): Promise<CommentItem[]> {
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(100));
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
    return {
      id: d.id,
      authorId: data.authorId,
      author: authorsMap[data.authorId] ?? { id: data.authorId, name: 'Usuário', initials: 'U' },
      content: data.content ?? '',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
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
  const [likedProfiles, setLikedProfiles] = useState<Record<string, PostAuthor>>({});
  const [likesModalPost, setLikesModalPost] = useState<PostItem | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);
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

  // Carrega perfis (foto, nome) de quem curtiu, para exibir os avatarzinhos.
  useEffect(() => {
    const ids = new Set<string>();
    posts.forEach((p) => p.likedByUserIds.slice(0, 3).forEach((id) => ids.add(id)));
    const toFetch = [...ids].filter((id) => !likedProfiles[id]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    Promise.all(toFetch.map((id) => buildAuthor(id))).then((profiles) => {
      if (cancelled) return;
      const next: Record<string, PostAuthor> = {};
      profiles.forEach((p) => { next[p.id] = p; });
      setLikedProfiles((prev) => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
  }, [posts, likedProfiles]);

  // Ao abrir o modal de curtidas, carrega os perfis de todo mundo que curtiu.
  useEffect(() => {
    if (!likesModalPost) return;
    const toFetch = likesModalPost.likedByUserIds.filter((id) => !likedProfiles[id]);
    if (toFetch.length === 0) return;
    let cancelled = false;
    Promise.all(toFetch.map((id) => buildAuthor(id))).then((profiles) => {
      if (cancelled) return;
      const next: Record<string, PostAuthor> = {};
      profiles.forEach((p) => { next[p.id] = p; });
      setLikedProfiles((prev) => ({ ...prev, ...next }));
    });
    return () => { cancelled = true; };
  }, [likesModalPost, likedProfiles]);

  const publish = async () => {
    if (!newPost.trim()) return;
    try {
      setPublishing(true);
      await addDoc(collection(db, 'posts'), {
        authorId: currentUserId,
        content: newPost.trim(),
        createdAt: serverTimestamp(),
        commentCount: 0,
        likedBy: [],
      });
      setNewPost('');
      await load();
    } catch (e) { showError(e, 'Erro ao publicar'); }
    finally { setPublishing(false); }
  };

  const toggleLike = async (post: PostItem) => {
    const ref = doc(db, 'posts', post.id);
    try {
      // As regras do Firestore só permitem update de post alheio quando o único
      // campo alterado é `likedBy` — por isso curtida não pode ir junto de outro campo.
      if (post.likedByMe) {
        await updateDoc(ref, { likedBy: arrayRemove(currentUserId) });
      } else {
        await updateDoc(ref, { likedBy: arrayUnion(currentUserId) });
      }
      setPosts((prev) => prev.map((p) => {
        if (p.id !== post.id) return p;
        const likedByUserIds = post.likedByMe
          ? p.likedByUserIds.filter((id) => id !== currentUserId)
          : [...p.likedByUserIds, currentUserId];
        return { ...p, likedByMe: !p.likedByMe, likeCount: likedByUserIds.length, likedByUserIds };
      }));
    } catch (e) {
      showError(e, 'Erro ao curtir');
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    if (!comments[postId]) {
      try {
        const list = await loadComments(postId);
        setComments((prev) => ({ ...prev, [postId]: list }));
      } catch (e) {
        showError(e, 'Erro ao carregar comentários');
      }
    }
  };

  const addComment = async (postId: string) => {
    const content = (newComment[postId] ?? '').trim();
    if (!content || submittingComment) return;
    setSubmittingComment(postId);
    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        authorId: currentUserId,
        content,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      const author = await buildAuthor(currentUserId);
      setComments((prev) => ({
        ...prev,
        [postId]: [
          ...(prev[postId] ?? []),
          { id: `tmp-${Date.now()}`, authorId: currentUserId, author, content, createdAt: new Date() },
        ],
      }));
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)));
      setNewComment((prev) => ({ ...prev, [postId]: '' }));
    } catch (e) {
      showError(e, 'Erro ao comentar');
    } finally {
      setSubmittingComment(null);
    }
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
                <TouchableOpacity style={feedStyles.action} onPress={() => toggleComments(post.id)}>
                  <Ionicons name="chatbubble-outline" size={18} color="#9ca3af" />
                  {post.commentCount > 0 && (
                    <Text style={feedStyles.actionCount}>{post.commentCount}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {post.likeCount > 0 && (
                <TouchableOpacity
                  style={feedStyles.likedByRow}
                  onPress={() => setLikesModalPost(post)}
                  activeOpacity={0.7}
                >
                  <View style={feedStyles.likedByAvatars}>
                    {post.likedByUserIds.slice(0, 3).map((uid, i) => {
                      const profile = likedProfiles[uid];
                      return (
                        <View
                          key={uid}
                          style={[feedStyles.likedByAvatarWrap, i > 0 && { marginLeft: -10 }]}
                        >
                          <Avatar uri={profile?.pictureUrl} initials={profile?.initials ?? '?'} size={20} fontSize={9} />
                        </View>
                      );
                    })}
                  </View>
                  <Text style={feedStyles.likedByText} numberOfLines={1}>
                    {(() => {
                      const names = post.likedByUserIds.slice(0, 2).map((id) => likedProfiles[id]?.name || 'Alguém');
                      const rest = post.likeCount - names.length;
                      if (names.length === 0) {
                        return `${post.likeCount} ${post.likeCount === 1 ? 'curtida' : 'curtidas'}`;
                      }
                      if (rest <= 0) return `Curtido por ${names.join(' e ')}`;
                      if (rest === 1) return `Curtido por ${names.join(', ')} e outra pessoa`;
                      return `Curtido por ${names.join(', ')} e outras ${rest} pessoas`;
                    })()}
                  </Text>
                </TouchableOpacity>
              )}

              {expandedPostId === post.id && (
                <View style={feedStyles.commentsSection}>
                  {(comments[post.id] ?? []).length === 0 ? (
                    <Text style={feedStyles.noComments}>Nenhum comentário ainda. Seja o primeiro!</Text>
                  ) : (
                    (comments[post.id] ?? []).map((c) => (
                      <View key={c.id} style={feedStyles.commentRow}>
                        <Avatar uri={c.author.pictureUrl} initials={c.author.initials} size={28} fontSize={11} />
                        <View style={{ flex: 1 }}>
                          <View style={feedStyles.commentBubble}>
                            <Text style={feedStyles.commentAuthor}>{c.author.name}</Text>
                            <PostContent content={c.content} style={feedStyles.commentContent} />
                          </View>
                          <Text style={feedStyles.commentTime}>{timeAgo(c.createdAt)}</Text>
                        </View>
                      </View>
                    ))
                  )}
                  <View style={feedStyles.commentInputRow}>
                    <TextInput
                      style={feedStyles.commentInput}
                      placeholder="Escreva um comentário..."
                      placeholderTextColor="#9ca3af"
                      value={newComment[post.id] ?? ''}
                      onChangeText={(v) => setNewComment((prev) => ({ ...prev, [post.id]: v }))}
                      multiline
                    />
                    <TouchableOpacity
                      style={[
                        feedStyles.commentSendBtn,
                        (!(newComment[post.id] ?? '').trim() || submittingComment === post.id) &&
                          feedStyles.publishBtnDisabled,
                      ]}
                      onPress={() => addComment(post.id)}
                      disabled={!(newComment[post.id] ?? '').trim() || submittingComment === post.id}
                    >
                      {submittingComment === post.id ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Ionicons name="send" size={16} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <PhotoViewer
        uri={selectedPhoto}
        visible={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />

      <Modal
        visible={!!likesModalPost}
        transparent
        animationType="fade"
        onRequestClose={() => setLikesModalPost(null)}
      >
        <View style={feedStyles.modalOverlay}>
          <View style={feedStyles.modalCard}>
            <View style={feedStyles.modalHeader}>
              <Text style={feedStyles.modalTitle}>Curtidas ({likesModalPost?.likeCount ?? 0})</Text>
              <TouchableOpacity onPress={() => setLikesModalPost(null)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {(likesModalPost?.likedByUserIds ?? []).map((uid) => {
                const profile = likedProfiles[uid];
                return (
                  <View key={uid} style={feedStyles.modalUserRow}>
                    <Avatar uri={profile?.pictureUrl} initials={profile?.initials ?? '?'} size={40} fontSize={14} />
                    <Text style={feedStyles.modalUserName}>{profile?.name ?? 'Carregando...'}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ---------- Ranking Tab ----------
function RankingTab() {
  const router = useRouter();
  const [ranking, setRanking] = useState<HoursRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRanking((await getHoursRanking()).entries);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <ActivityIndicator color="#10b981" style={{ marginTop: 32 }} />;

  return (
    <ScrollView contentContainerStyle={rankingStyles.content}>
      {ranking.map((entry, i) => (
        <TouchableOpacity
          key={entry.id}
          style={rankingStyles.row}
          onPress={() => router.push({ pathname: '/perfil', params: { userId: entry.id } })}
          activeOpacity={0.7}
        >
          <Text style={rankingStyles.rank}>#{i + 1}</Text>
          <Avatar uri={entry.pictureUrl} initials={entry.initials} size={36} />
          <Text style={rankingStyles.name}>{entry.name}</Text>
          <Text style={rankingStyles.hours}>{entry.hours}h</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ---------- Quem Anima Tab ----------
function QuemAnimaTab({ currentUserId }: { currentUserId: string }) {
  const { appUser } = useAuth();
  const router = useRouter();
  const { showError } = useToast();
  const [posts, setPosts] = useState<QuemAnimaPostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const courtIds = appUser?.courtIds ?? [];

  const load = useCallback(async () => {
    if (!currentUserId) return;
    try {
      setPosts(await listOpenPosts(currentUserId, courtIds));
    } catch (e) {
      showError(e, 'Não foi possível carregar os posts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId, courtIds.join(',')]);

  // Recarrega ao voltar de criar/abrir um post.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const quickInterest = async (post: QuemAnimaPostView) => {
    setBusyId(post.id);
    try {
      await toggleInterest(post, currentUserId, appUser?.firstName || 'Alguém');
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <ActivityIndicator color="#10b981" style={{ marginTop: 32 }} />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={quemStyles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#10b981"
          />
        }
      >
        {posts.length === 0 ? (
          <View style={quemStyles.empty}>
            <Ionicons name="tennisball-outline" size={52} color="#d1d5db" />
            <Text style={quemStyles.emptyTitle}>Ninguém procurando jogo ainda</Text>
            <Text style={quemStyles.emptyText}>
              Publique um "Quem anima?" e a galera é avisada na hora.
            </Text>
            <TouchableOpacity
              style={quemStyles.emptyBtn}
              onPress={() => router.push('/novo-quem-anima')}
            >
              <Ionicons name="add" size={18} color="#ffffff" />
              <Text style={quemStyles.emptyBtnText}>Criar o primeiro post</Text>
            </TouchableOpacity>
          </View>
        ) : (
          posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[quemStyles.postCard, post.isMine && quemStyles.postCardMine]}
              onPress={() => router.push({ pathname: '/quem-anima/[id]', params: { id: post.id } })}
              activeOpacity={0.85}
            >
              <View style={quemStyles.postHeader}>
                <Avatar uri={post.author.pictureUrl} initials={post.author.initials} size={40} fontSize={15} />
                <View style={{ flex: 1 }}>
                  <View style={quemStyles.nameRow}>
                    <Text style={quemStyles.postAuthor}>
                      {post.isMine ? 'Você' : post.author.name}
                    </Text>
                    {post.isMine && (
                      <View style={quemStyles.mineTag}>
                        <Text style={quemStyles.mineTagText}>seu post</Text>
                      </View>
                    )}
                  </View>
                  <Text style={quemStyles.postFormat}>Procurando {post.formatLabel}</Text>
                </View>
                <View style={quemStyles.formatBadge}>
                  <Text style={quemStyles.formatBadgeText}>
                    {post.format === 'ambos' ? '1x1/2x2' : post.format}
                  </Text>
                </View>
              </View>

              <View style={quemStyles.metaRow}>
                <Ionicons
                  name={post.timeMode === 'tbd' ? 'help-circle-outline' : 'time-outline'}
                  size={15}
                  color="#059669"
                />
                <Text style={quemStyles.metaText}>{post.whenLabel}</Text>
                <Text style={quemStyles.metaDot}>·</Text>
                <Text style={quemStyles.metaText}>{post.courtName}</Text>
              </View>

              {!!post.description && (
                <Text style={quemStyles.postDescription} numberOfLines={2}>
                  {post.description}
                </Text>
              )}

              <View style={quemStyles.postFooter}>
                <View style={quemStyles.counters}>
                  {post.interested.length > 0 && (
                    <View style={quemStyles.counter}>
                      <Ionicons name="hand-right-outline" size={14} color="#6b7280" />
                      <Text style={quemStyles.counterText}>{post.interested.length}</Text>
                    </View>
                  )}
                  {post.confirmed.length > 0 && (
                    <View style={quemStyles.counter}>
                      <Ionicons name="people-outline" size={14} color="#6b7280" />
                      <Text style={quemStyles.counterText}>{post.confirmed.length}</Text>
                    </View>
                  )}
                  {post.allowComments && post.commentCount > 0 && (
                    <View style={quemStyles.counter}>
                      <Ionicons name="chatbubble-outline" size={14} color="#6b7280" />
                      <Text style={quemStyles.counterText}>{post.commentCount}</Text>
                    </View>
                  )}
                  {post.showWhatsapp && (
                    <Ionicons name="logo-whatsapp" size={15} color="#25D366" />
                  )}
                </View>

                {post.isMine ? (
                  <View style={quemStyles.manageHint}>
                    <Text style={quemStyles.manageHintText}>Gerenciar</Text>
                    <Ionicons name="chevron-forward" size={14} color="#059669" />
                  </View>
                ) : post.iAmConfirmed ? (
                  <View style={quemStyles.inGameTag}>
                    <Ionicons name="checkmark-done" size={14} color="#065f46" />
                    <Text style={quemStyles.inGameTagText}>No jogo</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      quemStyles.animoBtn,
                      post.iAmInterested && quemStyles.animoBtnActive,
                      busyId === post.id && quemStyles.animoBtnBusy,
                    ]}
                    onPress={() => quickInterest(post)}
                    disabled={busyId === post.id}
                  >
                    <Ionicons
                      name={post.iAmInterested ? 'checkmark-circle' : 'hand-right'}
                      size={15}
                      color={post.iAmInterested ? '#065f46' : '#ffffff'}
                    />
                    <Text
                      style={[
                        quemStyles.animoBtnText,
                        post.iAmInterested && quemStyles.animoBtnTextActive,
                      ]}
                    >
                      {post.iAmInterested ? 'Animou!' : 'Eu animo!'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {posts.length > 0 && (
        <TouchableOpacity
          style={quemStyles.fab}
          onPress={() => router.push('/novo-quem-anima')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------- Player Search Modal ----------
async function loadSearchableUsers(currentUserId: string): Promise<SearchableUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  const list: SearchableUser[] = [];
  snap.docs.forEach((d) => {
    if (d.id === currentUserId) return;
    const u = d.data();
    if (u?.isAnonymous === true) return;
    const firstName = u?.firstName ?? '';
    const lastName = u?.lastName ?? '';
    list.push({
      id: d.id,
      name: `${firstName} ${lastName}`.trim() || 'Jogador',
      initials: getInitials(firstName, lastName),
      pictureUrl: u?.pictureUrl ?? null,
      email: u?.email ?? undefined,
    });
  });
  return list;
}

function PlayerSearchModal({
  visible,
  onClose,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [users, setUsers] = useState<SearchableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [recommended, setRecommended] = useState<SearchableUser[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);

  useEffect(() => {
    if (!visible || !currentUserId) return;
    setLoadingUsers(true);
    loadSearchableUsers(currentUserId)
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));

    setLoadingRecommended(true);
    getSuggestedPartners(currentUserId, 10)
      .then((partners) =>
        setRecommended(
          partners.map((p) => ({
            id: p.userId,
            name: p.name,
            initials: p.initials,
            pictureUrl: p.pictureUrl ?? null,
          }))
        )
      )
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false));
  }, [visible, currentUserId]);

  const handleClose = () => {
    setTerm('');
    onClose();
  };

  const goToProfile = (userId: string) => {
    handleClose();
    router.push({ pathname: '/perfil', params: { userId } });
  };

  const normalizedTerm = term.trim().toLowerCase();
  const filtered = normalizedTerm
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(normalizedTerm) ||
          (u.email?.toLowerCase().includes(normalizedTerm) ?? false)
      )
    : [];

  const renderRow = (u: SearchableUser) => (
    <TouchableOpacity key={u.id} style={searchStyles.row} onPress={() => goToProfile(u.id)}>
      <Avatar uri={u.pictureUrl} initials={u.initials} size={40} fontSize={14} />
      <View style={{ flex: 1 }}>
        <Text style={searchStyles.rowName} numberOfLines={1}>{u.name}</Text>
        {!!u.email && (
          <Text style={searchStyles.rowEmail} numberOfLines={1}>{u.email}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={searchStyles.container}>
        <View style={searchStyles.header}>
          <View style={searchStyles.inputWrap}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={searchStyles.input}
              placeholder="Buscar jogadores..."
              placeholderTextColor="#9ca3af"
              value={term}
              onChangeText={setTerm}
              autoFocus
            />
          </View>
          <TouchableOpacity onPress={handleClose} style={searchStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {normalizedTerm ? (
            <>
              <Text style={searchStyles.sectionTitle}>Resultados</Text>
              {loadingUsers ? (
                <ActivityIndicator color="#10b981" style={{ marginTop: 24 }} />
              ) : filtered.length === 0 ? (
                <Text style={searchStyles.emptyText}>
                  Nenhum jogador encontrado para &quot;{term.trim()}&quot;
                </Text>
              ) : (
                filtered.map(renderRow)
              )}
            </>
          ) : (
            <>
              <Text style={searchStyles.sectionTitle}>Recomendações</Text>
              <Text style={searchStyles.sectionSubtitle}>Pessoas com quem você já jogou</Text>
              {loadingRecommended ? (
                <ActivityIndicator color="#10b981" style={{ marginTop: 24 }} />
              ) : recommended.length === 0 ? (
                <Text style={searchStyles.emptyText}>Jogue partidas para ver recomendações</Text>
              ) : (
                recommended.map(renderRow)
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------- Main Social Screen ----------
export default function SocialScreen() {
  const { firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [searchOpen, setSearchOpen] = useState(false);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'feed', label: 'Feed', icon: 'list-outline' },
    { key: 'ranking', label: 'Ranking', icon: 'trophy-outline' },
    { key: 'quem-anima', label: 'Quem anima?', icon: 'hand-right-outline' },
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
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => setSearchOpen(true)}
          accessibilityLabel="Buscar jogadores"
        >
          <Ionicons name="search" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'feed' && <FeedTab currentUserId={firebaseUser?.uid ?? ''} />}
      {activeTab === 'ranking' && <RankingTab />}
      {activeTab === 'quem-anima' && <QuemAnimaTab currentUserId={firebaseUser?.uid ?? ''} />}

      <PlayerSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        currentUserId={firebaseUser?.uid ?? ''}
      />
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
  searchBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
});

const searchStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff', paddingTop: 56 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  input: { flex: 1, fontSize: 14, color: '#111827' },
  closeBtn: { padding: 4 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionSubtitle: { fontSize: 12, color: '#9ca3af', paddingHorizontal: 16, paddingBottom: 8 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowEmail: { fontSize: 12, color: '#9ca3af' },
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

  likedByRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -2 },
  likedByAvatars: { flexDirection: 'row', alignItems: 'center' },
  likedByAvatarWrap: { borderRadius: 12, borderWidth: 2, borderColor: '#ffffff' },
  likedByText: { flex: 1, fontSize: 12, color: '#6b7280' },

  commentsSection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 10,
  },
  noComments: { fontSize: 13, color: '#9ca3af', paddingVertical: 4 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentBubble: {
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentAuthor: { fontSize: 12, fontWeight: '700', color: '#111827', marginBottom: 2 },
  commentContent: { fontSize: 13, color: '#374151', lineHeight: 18 },
  commentTime: { fontSize: 11, color: '#9ca3af', marginTop: 2, marginLeft: 4 },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  commentInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    maxHeight: 90,
  },
  commentSendBtn: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    gap: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalUserRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  modalUserName: { fontSize: 14, fontWeight: '600', color: '#111827' },
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
  content: { padding: 16, gap: 12, paddingBottom: 96 },

  empty: { alignItems: 'center', paddingTop: 70, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 4 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  emptyBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },

  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 9,
  },
  // Post do próprio usuário: verde claro, para ele achar o dele de relance.
  postCardMine: { backgroundColor: '#f0fdf4', borderColor: '#6ee7b7' },

  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postAuthor: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mineTag: { backgroundColor: '#a7f3d0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  mineTagText: { fontSize: 10, fontWeight: '700', color: '#065f46' },
  postFormat: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  formatBadge: {
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  formatBadgeText: { fontSize: 11, fontWeight: '800', color: '#059669' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  metaDot: { fontSize: 13, color: '#d1d5db' },

  postDescription: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 8,
    padding: 9,
  },

  postFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 1,
  },
  counters: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  counterText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  animoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  animoBtnActive: { backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#10b981' },
  animoBtnBusy: { opacity: 0.5 },
  animoBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  animoBtnTextActive: { color: '#065f46' },

  inGameTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#a7f3d0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  inGameTagText: { fontSize: 12, fontWeight: '700', color: '#065f46' },

  manageHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  manageHintText: { fontSize: 13, fontWeight: '700', color: '#059669' },

  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
