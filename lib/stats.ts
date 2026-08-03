/**
 * Funções de stats espelhadas do app web (src/lib/queries/stats.ts).
 * Usa reservation_participants para contar TODAS as reservas do usuário,
 * não apenas as que ele criou.
 */
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  documentId,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const RESERVATION_DURATION_HOURS = 1.5;
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAY_NAMES_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const FIRESTORE_IN_LIMIT = 30;

// Detecção de padrão para sugestão de reserva (espelha src/lib/queries/stats.ts do web).
const MIN_PAST_RESERVATIONS_FOR_SUGGESTION = 5;
const MIN_SLOT_OCCURRENCES = 3;
const MIN_SLOT_PERCENT = 0.25;
const FALLBACK_MIN_OCCURRENCES = 2;
const FALLBACK_MIN_PERCENT = 0.2;

export interface NextReservationInfo {
  id: string;
  dateLabel: string;
  time: string;
  participants: string[];
}

export interface DayStat {
  day: string;
  count: number;
}

export interface PartnerStat {
  userId: string;
  name: string;
  initials: string;
  pictureUrl?: string;
  count: number;
}

export interface ReservationListItem {
  id: string;
  dateLabel: string;
  time: string;
  participants: string[];
  createdById: string;
}

/** Sugestão de reserva baseada no padrão de uso (ex.: sempre quarta às 19h). */
export interface ReservationSuggestion {
  dayOfWeek: number;
  hour: number;
  label: string;
  nextDateISO: string;
}

export interface UserStats {
  totalHours: number;
  totalReservations: number;
  weekStreak: number;
  dayStats: DayStat[];
  topPartners: PartnerStat[];
  nextReservation: NextReservationInfo | null;
  upcomingReservations: ReservationListItem[];
  pastReservations: ReservationListItem[];
  reservationSuggestion: ReservationSuggestion | null;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function getReservationIdsForUser(userId: string): Promise<Set<string>> {
  const [asCreatorSnap, asParticipantSnap] = await Promise.all([
    getDocs(query(collection(db, 'reservations'), where('createdById', '==', userId))),
    getDocs(query(collection(db, 'reservationParticipants'), where('userId', '==', userId))),
  ]);

  const ids = new Set<string>();
  asCreatorSnap.docs.forEach((d) => ids.add(d.id));
  asParticipantSnap.docs.forEach((d) => ids.add(d.data().reservationId));
  return ids;
}

/**
 * Blocos de organização do "Quem anima?" moram na mesma coleção, mas não são
 * jogos: se entrassem aqui virariam horas jogadas, parceiros e streak falsos.
 * Filtramos num ponto só, que é por onde todas as stats passam.
 */
async function getReservationsByIds(
  reservationIds: string[]
): Promise<Array<{ id: string; startAt: Date; endAt: Date; createdById: string }>> {
  if (reservationIds.length === 0) return [];
  const reservations: Array<{ id: string; startAt: Date; endAt: Date; createdById: string }> = [];

  for (let i = 0; i < reservationIds.length; i += FIRESTORE_IN_LIMIT) {
    const batch = reservationIds.slice(i, i + FIRESTORE_IN_LIMIT);
    const snap = await getDocs(
      query(collection(db, 'reservations'), where(documentId(), 'in', batch))
    );
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.type === 'organizing') return;
      reservations.push({
        id: d.id,
        startAt: data.startAt?.toDate?.() ?? new Date(),
        endAt: data.endAt?.toDate?.() ?? new Date(),
        createdById: data.createdById ?? '',
      });
    });
  }
  return reservations;
}

async function getParticipantNames(reservationId: string): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, 'reservationParticipants'), where('reservationId', '==', reservationId))
  );
  const names: string[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.guestName) {
      names.push(data.guestName);
    } else if (data.userId) {
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      if (userSnap.exists()) {
        const u = userSnap.data();
        const isAnon = u?.isAnonymous === true;
        names.push(isAnon ? 'Anônimo' : `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim());
      }
    }
  }
  return names.sort((a, b) => (a === 'Anônimo' ? 1 : a.localeCompare(b)));
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = d.getDate() - d.getDay();
  const sunday = new Date(d);
  sunday.setDate(diff);
  return sunday.toISOString().slice(0, 10);
}

function computeWeekStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const weekCounts = new Map<string, number>();
  dates.forEach((d) => {
    const key = getWeekKey(d);
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  });
  const sortedWeeks = Array.from(weekCounts.keys()).sort();
  let streak = 0;
  const thisWeek = getWeekKey(new Date());
  for (let i = sortedWeeks.length - 1; i >= 0; i--) {
    const week = sortedWeeks[i];
    if (week > thisWeek) continue;
    const prevWeek = i === 0 ? null : sortedWeeks[i - 1];
    const expectedPrev =
      prevWeek &&
      new Date(new Date(week).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (prevWeek !== expectedPrev && i < sortedWeeks.length - 1) break;
    streak++;
  }
  return streak;
}

/** Detecta o slot (dia da semana + hora) mais recorrente do usuário. */
function detectReservationPattern(
  pastStartDates: Date[]
): { dayOfWeek: number; hour: number } | null {
  if (pastStartDates.length < MIN_PAST_RESERVATIONS_FOR_SUGGESTION) return null;

  const slotCounts = new Map<string, number>();
  for (const d of pastStartDates) {
    const key = `${d.getDay()}-${d.getHours()}`;
    slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
  }

  const total = pastStartDates.length;
  let best: { dayOfWeek: number; hour: number; count: number } | null = null;
  for (const [key, count] of slotCounts) {
    const [dayStr, hourStr] = key.split('-');
    const dayOfWeek = parseInt(dayStr, 10);
    const hour = parseInt(hourStr, 10);
    const percent = count / total;
    if (count >= MIN_SLOT_OCCURRENCES && percent >= MIN_SLOT_PERCENT) {
      if (!best || count > best.count) best = { dayOfWeek, hour, count };
    }
  }
  if (best) return { dayOfWeek: best.dayOfWeek, hour: best.hour };

  const sorted = Array.from(slotCounts.entries())
    .map(([key, count]) => {
      const [dayStr, hourStr] = key.split('-');
      return { dayOfWeek: parseInt(dayStr, 10), hour: parseInt(hourStr, 10), count, percent: count / total };
    })
    .filter((e) => e.count >= FALLBACK_MIN_OCCURRENCES && e.percent >= FALLBACK_MIN_PERCENT)
    .sort((a, b) => b.count - a.count);

  if (sorted.length === 0) return null;
  return { dayOfWeek: sorted[0].dayOfWeek, hour: sorted[0].hour };
}

/** Próxima ocorrência de (dia da semana, hora) a partir de agora, em ISO date (YYYY-MM-DD). */
function getNextOccurrenceISO(dayOfWeek: number, hour: number): string {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  let diff = dayOfWeek - d.getDay();
  if (diff < 0) diff += 7;
  if (diff === 0 && d.getTime() <= now.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSuggestionLabel(dayOfWeek: number, hour: number): string {
  const dayName = DAY_NAMES_LONG[dayOfWeek] ?? DAY_NAMES[dayOfWeek];
  return `${dayName} às ${hour}h`;
}

/**
 * Parceiros mais frequentes do usuário (mesma base do topPartners de getUserStats),
 * numa consulta leve para a tela de nova reserva. Retorna até `limit` parceiros.
 */
export async function getSuggestedPartners(userId: string, limit = 6): Promise<PartnerStat[]> {
  const reservationIds = await getReservationIdsForUser(userId);
  const allReservations = await getReservationsByIds(Array.from(reservationIds));
  const now = new Date();
  const past = allReservations.filter((r) => r.endAt <= now);

  const partnerCounts = new Map<string, number>();
  const participantsSnaps = await Promise.all(
    past.map((r) =>
      getDocs(query(collection(db, 'reservationParticipants'), where('reservationId', '==', r.id)))
    )
  );
  for (const snap of participantsSnaps) {
    snap.docs.forEach((d) => {
      const uid = d.data().userId;
      if (uid && uid !== userId) partnerCounts.set(uid, (partnerCounts.get(uid) ?? 0) + 1);
    });
  }
  const topIds = Array.from(partnerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const docs = await Promise.all(topIds.map(([uid]) => getDoc(doc(db, 'users', uid))));
  const partners: PartnerStat[] = [];
  for (let i = 0; i < topIds.length; i++) {
    const [uid, count] = topIds[i];
    const snap = docs[i];
    if (snap.exists()) {
      const u = snap.data();
      if (u?.isAnonymous === true) continue;
      const firstName = u?.firstName ?? '';
      const lastName = u?.lastName ?? '';
      partners.push({
        userId: uid,
        name: `${firstName} ${lastName}`.trim() || 'Jogador',
        initials: `${(firstName || 'J')[0]}${(lastName || '?')[0]}`.toUpperCase(),
        pictureUrl: u?.pictureUrl,
        count,
      });
    }
  }
  return partners;
}

/**
 * Só as horas totais, sem parceiros/streak/participantes — usada no ranking,
 * onde getUserStats (pesado, com N+1 de nomes de participantes) foi trocado
 * por isto rodando em paralelo para todos os usuários.
 */
export async function getUserTotalHours(userId: string): Promise<number> {
  const reservationIds = await getReservationIdsForUser(userId);
  const allReservations = await getReservationsByIds(Array.from(reservationIds));
  const now = new Date();
  const pastCount = allReservations.filter((r) => r.endAt <= now).length;
  return Math.round(pastCount * RESERVATION_DURATION_HOURS * 10) / 10;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const reservationIds = await getReservationIdsForUser(userId);
  const allReservations = await getReservationsByIds(Array.from(reservationIds));

  const now = new Date();
  const past = allReservations.filter((r) => r.endAt <= now);
  const future = allReservations
    .filter((r) => r.endAt > now)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const totalHours = Math.round(past.length * RESERVATION_DURATION_HOURS * 10) / 10;
  const weekStreak = computeWeekStreak(past.map((r) => r.startAt));
  const dayStats: DayStat[] = DAY_NAMES.map((day, i) => ({
    day,
    count: past.filter((r) => r.startAt.getDay() === i).length,
  }));

  // Top partners
  const partnerCounts = new Map<string, number>();
  const participantsSnaps = await Promise.all(
    past.map((r) =>
      getDocs(query(collection(db, 'reservationParticipants'), where('reservationId', '==', r.id)))
    )
  );
  for (const snap of participantsSnaps) {
    snap.docs.forEach((d) => {
      const uid = d.data().userId;
      if (uid && uid !== userId) {
        partnerCounts.set(uid, (partnerCounts.get(uid) ?? 0) + 1);
      }
    });
  }
  const topPartnerIds = Array.from(partnerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topPartnerDocs = await Promise.all(topPartnerIds.map(([uid]) => getDoc(doc(db, 'users', uid))));
  const topPartners: PartnerStat[] = [];
  for (let i = 0; i < topPartnerIds.length; i++) {
    const [uid, count] = topPartnerIds[i];
    const snap = topPartnerDocs[i];
    if (snap.exists()) {
      const u = snap.data();
      if (u?.isAnonymous === true) continue;
      const firstName = u?.firstName ?? '';
      const lastName = u?.lastName ?? '';
      const name = `${firstName} ${lastName}`.trim() || 'Jogador';
      topPartners.push({
        userId: uid,
        name,
        initials: `${(firstName || 'J')[0]}${(lastName || '?')[0]}`.toUpperCase(),
        pictureUrl: u?.pictureUrl,
        count,
      });
    }
  }

  // Future reservations with participants
  const futureParticipants = await Promise.all(future.map((r) => getParticipantNames(r.id)));
  let nextReservation: NextReservationInfo | null = null;
  const upcomingReservations: ReservationListItem[] = future.map((r, i) => {
    const participants = futureParticipants[i];
    const isTomorrow =
      r.startAt.getDate() === now.getDate() + 1 &&
      r.startAt.getMonth() === now.getMonth() &&
      r.startAt.getFullYear() === now.getFullYear();
    const isToday = r.startAt.toDateString() === now.toDateString();
    const dateLabel = isToday
      ? 'Hoje'
      : isTomorrow
      ? 'Amanhã'
      : r.startAt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!nextReservation) {
      nextReservation = {
        id: r.id,
        dateLabel,
        time: `${formatTime(r.startAt)} – ${formatTime(r.endAt)}`,
        participants,
      };
    }
    return { id: r.id, dateLabel, time: `${formatTime(r.startAt)} – ${formatTime(r.endAt)}`, participants, createdById: r.createdById };
  });

  const pastSorted = [...past].sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
  const pastParticipants = await Promise.all(pastSorted.map((r) => getParticipantNames(r.id)));
  const pastReservations: ReservationListItem[] = pastSorted.map((r, i) => ({
    id: r.id,
    dateLabel: r.startAt.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }),
    time: `${formatTime(r.startAt)} – ${formatTime(r.endAt)}`,
    participants: pastParticipants[i],
    createdById: r.createdById,
  }));

  // Sugestão de reserva: slot recorrente que ainda não foi reservado.
  let reservationSuggestion: ReservationSuggestion | null = null;
  const pattern = detectReservationPattern(past.map((r) => r.startAt));
  if (pattern) {
    const nextDateISO = getNextOccurrenceISO(pattern.dayOfWeek, pattern.hour);
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const alreadyBooked = future.some((r) => toLocalISO(r.startAt) === nextDateISO);
    if (!alreadyBooked) {
      reservationSuggestion = {
        dayOfWeek: pattern.dayOfWeek,
        hour: pattern.hour,
        label: buildSuggestionLabel(pattern.dayOfWeek, pattern.hour),
        nextDateISO,
      };
    }
  }

  return {
    totalHours,
    totalReservations: allReservations.length,
    weekStreak,
    dayStats,
    topPartners,
    nextReservation,
    upcomingReservations,
    pastReservations,
    reservationSuggestion,
  };
}
