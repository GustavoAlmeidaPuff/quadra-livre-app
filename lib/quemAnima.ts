/**
 * "Quem anima?" — mural de convites para jogo.
 *
 * Um post é um convite aberto: dia, quadra, formato e (opcionalmente) hora.
 * Quando tem hora marcada, criamos junto um bloco `type: 'organizing'` em
 * `reservations` que segura o horário na agenda enquanto o jogo é articulado.
 * No "Fechou!" esse mesmo documento vira a reserva definitiva — ver
 * convertOrganizingToGame em lib/reservations.ts.
 *
 * As queries usam só filtro de igualdade e ordenam em memória de propósito:
 * o volume é pequeno (~150 jogadores, posts de poucos dias) e assim a feature
 * não exige nenhum índice composto novo no Firestore.
 */
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  GameFormat,
  QuemAnimaPost,
  QuemAnimaTimeMode,
} from '@/types';
import { getCourtName, normalizeCourtId } from '@/lib/courts';
import {
  createReservation,
  convertOrganizingToGame,
  deleteReservation,
  getCourtRules,
  computeEndAt,
} from '@/lib/reservations';
import { notifyUsers, getBroadcastAudience } from '@/lib/notifications';

const POSTS = 'quemAnimaPosts';

export interface PostUser {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  pictureUrl?: string | null;
}

/** Post já resolvido para exibição: autor, jogadores e flags do usuário atual. */
export interface QuemAnimaPostView extends QuemAnimaPost {
  author: PostUser;
  confirmed: PostUser[];
  interested: PostUser[];
  isMine: boolean;
  iAmInterested: boolean;
  iAmConfirmed: boolean;
  courtName: string;
  whenLabel: string;
  formatLabel: string;
}

export interface QuemAnimaCommentView {
  id: string;
  author: PostUser;
  content: string;
  createdAt: Date;
}

// ---------- helpers de formatação ----------

export function formatLabelOf(format: GameFormat): string {
  if (format === '1x1') return 'simples (1x1)';
  if (format === '2x2') return 'duplas (2x2)';
  return 'simples ou duplas';
}

export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateFromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "Hoje às 19:00", "Amanhã · a combinar", "sexta, 8 de ago às 20:00". */
export function whenLabelOf(
  dateISO: string,
  timeMode: QuemAnimaTimeMode,
  startAt?: Date | null
): string {
  const d = dateFromISO(dateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayPart: string;
  if (d.getTime() === today.getTime()) dayPart = 'Hoje';
  else if (d.getTime() === tomorrow.getTime()) dayPart = 'Amanhã';
  else dayPart = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });

  if (timeMode === 'tbd' || !startAt) return `${dayPart} · horário a combinar`;
  return `${dayPart} às ${fmtTime(startAt)}`;
}

function buildUser(id: string, data: Record<string, any> | undefined): PostUser {
  const firstName = data?.firstName ?? '';
  const lastName = data?.lastName ?? '';
  return {
    id,
    name: `${firstName} ${lastName}`.trim() || 'Jogador',
    firstName: firstName || 'Jogador',
    initials: `${(firstName || 'J')[0]}${(lastName || '')[0] ?? ''}`.toUpperCase(),
    pictureUrl: data?.pictureUrl ?? null,
  };
}

async function resolveUsers(ids: string[]): Promise<Map<string, PostUser>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, PostUser>();
  const snaps = await Promise.all(unique.map((id) => getDoc(doc(db, 'users', id))));
  snaps.forEach((snap, i) => {
    map.set(unique[i], buildUser(unique[i], snap.exists() ? snap.data() : undefined));
  });
  return map;
}

function toPost(id: string, data: Record<string, any>): QuemAnimaPost {
  return {
    id,
    authorId: data.authorId ?? '',
    courtId: normalizeCourtId(data.courtId),
    format: (data.format ?? 'ambos') as GameFormat,
    dateISO: data.dateISO ?? '',
    timeMode: (data.timeMode ?? 'tbd') as QuemAnimaTimeMode,
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    description: data.description ?? '',
    showWhatsapp: data.showWhatsapp === true,
    whatsappPhone: data.whatsappPhone ?? null,
    allowComments: data.allowComments !== false,
    confirmedUserIds: data.confirmedUserIds ?? [],
    interestedUserIds: data.interestedUserIds ?? [],
    status: data.status ?? 'open',
    commentCount: data.commentCount ?? 0,
    organizingReservationId: data.organizingReservationId ?? null,
    reservationId: data.reservationId ?? null,
    createdAt: data.createdAt ?? Timestamp.now(),
    closedAt: data.closedAt ?? null,
  };
}

function decorate(post: QuemAnimaPost, users: Map<string, PostUser>, currentUserId: string): QuemAnimaPostView {
  const fallback = (id: string) => users.get(id) ?? buildUser(id, undefined);
  return {
    ...post,
    author: fallback(post.authorId),
    confirmed: post.confirmedUserIds.map(fallback),
    interested: post.interestedUserIds.map(fallback),
    isMine: post.authorId === currentUserId,
    iAmInterested: post.interestedUserIds.includes(currentUserId),
    iAmConfirmed: post.confirmedUserIds.includes(currentUserId),
    courtName: getCourtName(post.courtId),
    whenLabel: whenLabelOf(post.dateISO, post.timeMode, post.startAt?.toDate?.() ?? null),
    formatLabel: formatLabelOf(post.format),
  };
}

// ---------- leitura ----------

/**
 * Posts abertos, do dia de hoje em diante. Os do próprio usuário vêm primeiro
 * (a tela também os destaca em outra cor), depois ordena por data/hora.
 */
export async function listOpenPosts(
  currentUserId: string,
  courtIds: string[] = []
): Promise<QuemAnimaPostView[]> {
  const snap = await getDocs(query(collection(db, POSTS), where('status', '==', 'open')));
  const todayISO = localISO(new Date());

  const posts = snap.docs
    .map((d) => toPost(d.id, d.data()))
    .filter((p) => p.dateISO >= todayISO)
    .filter((p) => courtIds.length === 0 || courtIds.includes(p.courtId));

  const users = await resolveUsers(
    posts.flatMap((p) => [p.authorId, ...p.confirmedUserIds, ...p.interestedUserIds])
  );

  return posts
    .map((p) => decorate(p, users, currentUserId))
    .sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1;
      const at = a.startAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      const bt = b.startAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
}

export async function getPostView(
  postId: string,
  currentUserId: string
): Promise<QuemAnimaPostView | null> {
  const snap = await getDoc(doc(db, POSTS, postId));
  if (!snap.exists()) return null;
  const post = toPost(snap.id, snap.data());
  const users = await resolveUsers([post.authorId, ...post.confirmedUserIds, ...post.interestedUserIds]);
  return decorate(post, users, currentUserId);
}

export async function listComments(postId: string): Promise<QuemAnimaCommentView[]> {
  const snap = await getDocs(
    query(collection(db, POSTS, postId, 'comments'), orderBy('createdAt', 'asc'))
  );
  const users = await resolveUsers(snap.docs.map((d) => d.data().authorId));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      author: users.get(data.authorId) ?? buildUser(data.authorId, undefined),
      content: data.content ?? '',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
    };
  });
}

// ---------- escrita ----------

export interface CreatePostInput {
  authorId: string;
  authorFirstName: string;
  courtId: string;
  format: GameFormat;
  dateISO: string;
  timeMode: QuemAnimaTimeMode;
  /** Obrigatório quando timeMode === 'fixed'. */
  startAt?: Date | null;
  description: string;
  showWhatsapp: boolean;
  whatsappPhone?: string | null;
  allowComments: boolean;
  confirmedUserIds: string[];
}

/**
 * Cria o post e, se tem hora marcada, o bloco de organização na agenda.
 *
 * A reserva vem primeiro de propósito: se o horário já estiver ocupado,
 * createReservation lança com a mensagem amigável e nenhum post é criado —
 * melhor falhar antes do que deixar um convite para um horário indisponível.
 */
export async function createQuemAnimaPost(input: CreatePostInput): Promise<string> {
  const courtId = normalizeCourtId(input.courtId);
  let organizingReservationId: string | null = null;
  let endAt: Date | null = null;

  if (input.timeMode === 'fixed' && input.startAt) {
    const rules = await getCourtRules(courtId);
    endAt = computeEndAt(input.startAt, rules);
    organizingReservationId = await createReservation({
      createdById: input.authorId,
      startAt: input.startAt,
      endAt,
      courtId,
      participantIds: [],
      type: 'organizing',
    });
  }

  const postRef = await addDoc(collection(db, POSTS), {
    authorId: input.authorId,
    courtId,
    format: input.format,
    dateISO: input.dateISO,
    timeMode: input.timeMode,
    startAt: input.startAt ? Timestamp.fromDate(input.startAt) : null,
    endAt: endAt ? Timestamp.fromDate(endAt) : null,
    description: input.description.trim(),
    showWhatsapp: input.showWhatsapp,
    whatsappPhone: input.showWhatsapp ? input.whatsappPhone ?? null : null,
    allowComments: input.allowComments,
    confirmedUserIds: input.confirmedUserIds,
    interestedUserIds: [],
    status: 'open',
    commentCount: 0,
    organizingReservationId,
    reservationId: null,
    createdAt: Timestamp.now(),
    closedAt: null,
  });

  // Liga o bloco cinza ao post, para a agenda conseguir abrir o post ao toque.
  if (organizingReservationId) {
    await updateDoc(doc(db, 'reservations', organizingReservationId), {
      quemAnimaPostId: postRef.id,
    });
  }

  const whenLabel = whenLabelOf(input.dateISO, input.timeMode, input.startAt ?? null);
  const audience = await getBroadcastAudience(input.authorId, courtId);
  await notifyUsers({
    toUserIds: audience,
    type: 'quem_anima_novo',
    title: 'Quem anima?',
    message: `${input.authorFirstName} procura gente pra jogar ${formatLabelOf(input.format)} — ${whenLabel}, ${getCourtName(courtId)}. Anima?`,
    fromUserId: input.authorId,
    quemAnimaPostId: postRef.id,
  });

  return postRef.id;
}

/** "Eu animo!" / desfazer. Notifica o autor só quando alguém entra. */
export async function toggleInterest(
  post: QuemAnimaPostView,
  userId: string,
  userFirstName: string
): Promise<void> {
  const ref = doc(db, POSTS, post.id);
  if (post.iAmInterested) {
    await updateDoc(ref, { interestedUserIds: arrayRemove(userId) });
    return;
  }

  await updateDoc(ref, { interestedUserIds: arrayUnion(userId) });
  await notifyUsers({
    toUserIds: [post.authorId],
    type: 'quem_anima_interesse',
    title: 'Alguém animou!',
    message: `${userFirstName} animou no seu jogo de ${post.whenLabel}.`,
    fromUserId: userId,
    quemAnimaPostId: post.id,
  });
}

/** Move um interessado para a lista de confirmados do jogo. */
export async function addToGame(
  post: QuemAnimaPostView,
  userId: string,
  authorFirstName: string
): Promise<void> {
  await updateDoc(doc(db, POSTS, post.id), {
    confirmedUserIds: arrayUnion(userId),
    interestedUserIds: arrayRemove(userId),
  });
  await notifyUsers({
    toUserIds: [userId],
    type: 'quem_anima_adicionado',
    title: 'Você está no jogo!',
    message: `${authorFirstName} te adicionou no jogo de ${post.whenLabel}, ${post.courtName}.`,
    fromUserId: post.authorId,
    quemAnimaPostId: post.id,
  });
}

export async function removeFromGame(postId: string, userId: string): Promise<void> {
  await updateDoc(doc(db, POSTS, postId), { confirmedUserIds: arrayRemove(userId) });
}

export interface ClosePostResult {
  /** true quando o bloco de organização virou reserva definitiva. */
  reservationCreated: boolean;
}

/**
 * "Fechou!": encerra o post e tira do mural.
 *
 * Com hora marcada, o bloco cinza vira a reserva de verdade com os jogadores
 * confirmados. Sem hora marcada não há o que converter — o organizador ainda
 * precisa criar a reserva na mão, e a tela avisa isso.
 */
export async function closePost(post: QuemAnimaPostView): Promise<ClosePostResult> {
  let reservationCreated = false;

  if (post.organizingReservationId) {
    await convertOrganizingToGame(
      post.organizingReservationId,
      post.authorId,
      post.confirmedUserIds
    );
    reservationCreated = true;
  }

  await updateDoc(doc(db, POSTS, post.id), {
    status: 'closed',
    closedAt: Timestamp.now(),
    reservationId: post.organizingReservationId ?? null,
  });

  if (post.confirmedUserIds.length > 0) {
    await notifyUsers({
      toUserIds: post.confirmedUserIds,
      type: 'quem_anima_adicionado',
      title: 'Jogo confirmado!',
      message: `${post.author.firstName} fechou o jogo de ${post.whenLabel}, ${post.courtName}.`,
      fromUserId: post.authorId,
      quemAnimaPostId: post.id,
    });
  }

  return { reservationCreated };
}

/** Cancela o post e libera o horário que estava segurado. */
export async function cancelPost(post: QuemAnimaPostView): Promise<void> {
  if (post.organizingReservationId) {
    await deleteReservation(post.organizingReservationId);
  }
  await updateDoc(doc(db, POSTS, post.id), {
    status: 'cancelled',
    organizingReservationId: null,
    closedAt: Timestamp.now(),
  });
}

export async function deletePost(post: QuemAnimaPostView): Promise<void> {
  if (post.organizingReservationId) {
    await deleteReservation(post.organizingReservationId);
  }
  const comments = await getDocs(collection(db, POSTS, post.id, 'comments'));
  await Promise.all(comments.docs.map((c) => deleteDoc(c.ref)));
  await deleteDoc(doc(db, POSTS, post.id));
}

export async function addComment(
  post: QuemAnimaPostView,
  authorId: string,
  authorFirstName: string,
  content: string
): Promise<void> {
  const text = content.trim();
  if (!text) return;

  await addDoc(collection(db, POSTS, post.id, 'comments'), {
    authorId,
    content: text,
    createdAt: Timestamp.now(),
  });
  await updateDoc(doc(db, POSTS, post.id), { commentCount: increment(1) });

  // Avisa o autor e quem já comentou/animou, menos quem acabou de escrever.
  const targets = [post.authorId, ...post.interestedUserIds, ...post.confirmedUserIds].filter(
    (id) => id !== authorId
  );
  await notifyUsers({
    toUserIds: targets,
    type: 'quem_anima_comentario',
    title: 'Novo comentário',
    message: `${authorFirstName} comentou no jogo de ${post.whenLabel}.`,
    fromUserId: authorId,
    quemAnimaPostId: post.id,
  });
}

/** Link do WhatsApp com mensagem já preenchida. */
export function whatsappLink(phone: string, post: QuemAnimaPostView): string {
  const digits = phone.replace(/\D/g, '');
  const text = `Oi! Vi seu post no Quem anima? (${post.whenLabel}, ${post.courtName}). Bora jogar?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
