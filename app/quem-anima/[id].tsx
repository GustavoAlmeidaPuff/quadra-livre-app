import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';
import {
  getPostView,
  listComments,
  toggleInterest,
  addToGame,
  removeFromGame,
  closePost,
  cancelPost,
  addComment,
  whatsappLink,
  QuemAnimaPostView,
  QuemAnimaCommentView,
  PostUser,
} from '@/lib/quemAnima';
import { openWhatsapp } from '@/lib/whatsapp';

function timeAgo(date: Date): string {
  const s = (Date.now() - date.getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return date.toLocaleDateString('pt-BR');
}

function PersonRow({
  user,
  action,
}: {
  user: PostUser;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.personRow}>
      <TouchableOpacity
        style={styles.personMain}
        onPress={() => router.push({ pathname: '/perfil', params: { userId: user.id } })}
        activeOpacity={0.7}
      >
        <Avatar uri={user.pictureUrl} initials={user.initials} size={36} />
        <Text style={styles.personName}>{user.name}</Text>
      </TouchableOpacity>
      {action}
    </View>
  );
}

export default function QuemAnimaPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { firebaseUser, appUser } = useAuth();
  const { showError, showToast } = useToast();

  const [post, setPost] = useState<QuemAnimaPostView | null>(null);
  const [comments, setComments] = useState<QuemAnimaCommentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const uid = firebaseUser?.uid ?? '';
  const myFirstName = appUser?.firstName || 'Alguém';

  const load = useCallback(async () => {
    if (!id || !uid) return;
    try {
      const p = await getPostView(id, uid);
      setPost(p);
      if (p?.allowComments) setComments(await listComments(id));
    } catch (e) {
      showError(e, 'Não foi possível carregar o post');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInterest = async () => {
    if (!post) return;
    setBusy(true);
    try {
      await toggleInterest(post, uid, myFirstName);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (userId: string) => {
    if (!post) return;
    setBusy(true);
    try {
      await addToGame(post, userId, myFirstName);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!post) return;
    setBusy(true);
    try {
      await removeFromGame(post.id, userId);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (!post) return;
    const hasReservation = !!post.organizingReservationId;
    Alert.alert(
      'Fechar o jogo?',
      hasReservation
        ? 'O post sai do mural e o horário vira reserva confirmada com os jogadores adicionados.'
        : 'O post sai do mural. Como não tem hora marcada, lembre de criar a reserva na agenda.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Fechou!',
          onPress: async () => {
            setBusy(true);
            try {
              const { reservationCreated } = await closePost(post);
              showToast({
                variant: 'success',
                title: 'Jogo fechado!',
                description: reservationCreated
                  ? 'A reserva já está confirmada na agenda.'
                  : 'Não esqueça de reservar o horário na agenda.',
              });
              router.back();
            } catch (e) {
              showError(e, 'Não foi possível fechar');
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (!post) return;
    Alert.alert(
      'Cancelar post',
      post.organizingReservationId
        ? 'O post sai do mural e o horário volta a ficar livre na agenda.'
        : 'O post sai do mural.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar post',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await cancelPost(post);
              showToast({ variant: 'success', title: 'Post cancelado' });
              router.back();
            } catch (e) {
              showError(e, 'Não foi possível cancelar');
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleComment = async () => {
    if (!post || !newComment.trim()) return;
    setSendingComment(true);
    try {
      await addComment(post, uid, myFirstName, newComment);
      setNewComment('');
      await load();
    } catch (e) {
      showError(e, 'Não foi possível comentar');
    } finally {
      setSendingComment(false);
    }
  };

  const handleOpenWhatsapp = async () => {
    if (!post?.whatsappPhone) return;
    const url = whatsappLink(post.whatsappPhone, post);
    await openWhatsapp(url, () =>
      showToast({ variant: 'error', title: 'WhatsApp não encontrado neste aparelho.' })
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyText}>Post não encontrado.</Text>
      </View>
    );
  }

  const isClosed = post.status !== 'open';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen options={{ title: post.isMine ? 'Meu post' : 'Quem anima?' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#10b981"
          />
        }
      >
        {isClosed && (
          <View style={styles.closedBanner}>
            <Ionicons name="checkmark-done" size={16} color="#065f46" />
            <Text style={styles.closedBannerText}>
              {post.status === 'closed' ? 'Este jogo já foi fechado.' : 'Este post foi cancelado.'}
            </Text>
          </View>
        )}

        {/* Cabeçalho */}
        <View style={[styles.card, post.isMine && styles.cardMine]}>
          <View style={styles.postHeader}>
            <Avatar uri={post.author.pictureUrl} initials={post.author.initials} size={44} fontSize={16} />
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>
                {post.isMine ? 'Você' : post.author.name}
              </Text>
              <Text style={styles.formatText}>Procurando {post.formatLabel}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={16} color="#059669" />
            <Text style={styles.metaText}>{post.whenLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color="#059669" />
            <Text style={styles.metaText}>{post.courtName}</Text>
          </View>

          {!!post.description && <Text style={styles.description}>{post.description}</Text>}

          {post.showWhatsapp && !!post.whatsappPhone && !post.isMine && (
            <TouchableOpacity style={styles.whatsappBtn} onPress={handleOpenWhatsapp} activeOpacity={0.85}>
              <Ionicons name="logo-whatsapp" size={20} color="#ffffff" />
              <Text style={styles.whatsappBtnText}>Combinar no WhatsApp</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Eu animo! */}
        {!post.isMine && !isClosed && (
          <TouchableOpacity
            style={[
              styles.animoBtn,
              post.iAmInterested && styles.animoBtnActive,
              post.iAmConfirmed && styles.animoBtnConfirmed,
              busy && styles.disabled,
            ]}
            onPress={handleInterest}
            disabled={busy || post.iAmConfirmed}
            activeOpacity={0.85}
          >
            <Ionicons
              name={post.iAmConfirmed ? 'checkmark-done' : post.iAmInterested ? 'checkmark-circle' : 'hand-right'}
              size={20}
              color={post.iAmInterested || post.iAmConfirmed ? '#065f46' : '#ffffff'}
            />
            <Text
              style={[
                styles.animoBtnText,
                (post.iAmInterested || post.iAmConfirmed) && styles.animoBtnTextActive,
              ]}
            >
              {post.iAmConfirmed
                ? 'Você está no jogo!'
                : post.iAmInterested
                ? 'Você animou — tocar pra desistir'
                : 'Eu animo!'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Jogadores confirmados */}
        {post.confirmed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NO JOGO ({post.confirmed.length})</Text>
            <View style={styles.card}>
              {post.confirmed.map((u) => (
                <PersonRow
                  key={u.id}
                  user={u}
                  action={
                    post.isMine && !isClosed ? (
                      <TouchableOpacity onPress={() => handleRemove(u.id)} disabled={busy}>
                        <Ionicons name="close-circle-outline" size={22} color="#9ca3af" />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="checkmark-circle" size={22} color="#10b981" />
                    )
                  }
                />
              ))}
            </View>
          </View>
        )}

        {/* Quem animou — só o autor decide quem entra */}
        {post.isMine && !isClosed && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>QUEM ANIMOU ({post.interested.length})</Text>
            {post.interested.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="hourglass-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyCardText}>
                  Ninguém animou ainda. Assim que alguém animar, aparece aqui.
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                {post.interested.map((u) => (
                  <PersonRow
                    key={u.id}
                    user={u}
                    action={
                      <TouchableOpacity
                        style={[styles.addBtn, busy && styles.disabled]}
                        onPress={() => handleAdd(u.id)}
                        disabled={busy}
                      >
                        <Ionicons name="add" size={16} color="#ffffff" />
                        <Text style={styles.addBtnText}>Adicionar</Text>
                      </TouchableOpacity>
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Quem animou, visto pelos outros */}
        {!post.isMine && post.interested.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>QUEM ANIMOU ({post.interested.length})</Text>
            <View style={styles.card}>
              {post.interested.map((u) => (
                <PersonRow key={u.id} user={u} />
              ))}
            </View>
          </View>
        )}

        {/* Comentários */}
        {post.allowComments && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COMENTÁRIOS ({comments.length})</Text>
            {comments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="chatbubble-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyCardText}>Nenhum comentário ainda.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {comments.map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <Avatar uri={c.author.pictureUrl} initials={c.author.initials} size={32} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHead}>
                        <Text style={styles.commentAuthor}>{c.author.name}</Text>
                        <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                      </View>
                      <Text style={styles.commentText}>{c.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {!isClosed && (
              <View style={styles.commentBox}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Escrever um comentário..."
                  placeholderTextColor="#9ca3af"
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={300}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    (!newComment.trim() || sendingComment) && styles.disabled,
                  ]}
                  onPress={handleComment}
                  disabled={!newComment.trim() || sendingComment}
                >
                  {sendingComment ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Ionicons name="send" size={18} color="#ffffff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Ações do autor */}
        {post.isMine && !isClosed && (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={[styles.closeBtn, busy && styles.disabled]}
              onPress={handleClose}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done" size={22} color="#ffffff" />
              <Text style={styles.closeBtnText}>Fechou!</Text>
            </TouchableOpacity>
            <Text style={styles.closeHint}>
              {post.organizingReservationId
                ? 'Encerra o post e confirma a reserva com quem está no jogo.'
                : 'Encerra o post e tira do mural.'}
            </Text>

            <TouchableOpacity
              style={styles.cancelLink}
              onPress={handleCancel}
              disabled={busy}
            >
              <Text style={styles.cancelLinkText}>Cancelar post</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40, gap: 18 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb' },
  emptyText: { fontSize: 14, color: '#9ca3af' },
  disabled: { opacity: 0.5 },

  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d1fae5',
    borderRadius: 12,
    padding: 12,
  },
  closedBannerText: { fontSize: 13, color: '#065f46', fontWeight: '600' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  cardMine: { borderColor: '#6ee7b7', backgroundColor: '#f0fdf4' },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  authorName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  formatText: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  description: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
  },

  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 2,
  },
  whatsappBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },

  animoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
  },
  animoBtnActive: { backgroundColor: '#d1fae5', borderWidth: 1, borderColor: '#10b981' },
  animoBtnConfirmed: { backgroundColor: '#a7f3d0', borderWidth: 1, borderColor: '#059669' },
  animoBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 16 },
  animoBtnTextActive: { color: '#065f46' },

  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyCardText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  personName: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#111827' },
  commentTime: { fontSize: 11, color: '#9ca3af' },
  commentText: { fontSize: 14, color: '#374151', lineHeight: 19, marginTop: 2 },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ownerActions: { gap: 8, marginTop: 4 },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 17,
  },
  closeBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 17 },
  closeHint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 17 },
  cancelLink: { alignItems: 'center', paddingVertical: 10 },
  cancelLinkText: { fontSize: 14, color: '#dc2626', fontWeight: '600' },
});
