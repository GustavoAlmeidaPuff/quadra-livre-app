import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Mesma constante de lib/stats.ts — toda reserva conta como 1h30 jogada. */
const RESERVATION_DURATION_HOURS = 1.5;

/** Documento com o ranking pré-calculado. Ver readCachedRanking(). */
const RANKING_DOC = { collection: 'rankings', id: 'hours' } as const;

export interface HoursRankingEntry {
  id: string;
  name: string;
  initials: string;
  pictureUrl?: string | null;
  hours: number;
  createdAt: Date;
}

export interface HoursRanking {
  entries: HoursRankingEntry[];
  /** Quando o ranking foi calculado. null = calculado agora, no próprio aparelho. */
  computedAt: Date | null;
}

function getInitials(firstName?: string, lastName?: string): string {
  return `${(firstName || 'U')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

/**
 * Lê o ranking pré-calculado, se existir.
 *
 * O documento é gravado por um job diário; o app só lê. Enquanto esse job não
 * existir, isto devolve null e o app cai no cálculo ao vivo de
 * computeHoursRanking(), que continua correto — só mais lento.
 */
async function readCachedRanking(): Promise<HoursRanking | null> {
  try {
    const snap = await getDoc(doc(db, RANKING_DOC.collection, RANKING_DOC.id));
    if (!snap.exists()) return null;
    const data = snap.data();
    const raw = data?.entries;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    return {
      computedAt: data?.computedAt?.toDate?.() ?? null,
      entries: raw.map((e: any) => ({
        id: String(e.id),
        name: String(e.name ?? 'Jogador'),
        initials: String(e.initials ?? 'U'),
        pictureUrl: e.pictureUrl ?? null,
        hours: Number(e.hours ?? 0),
        // Só existe para o desempate, que já veio resolvido na ordem gravada.
        createdAt: e.createdAt?.toDate?.() ?? new Date(0),
      })),
    };
  } catch {
    // Cache é otimização: qualquer problema aqui cai no cálculo ao vivo.
    return null;
  }
}

/**
 * Calcula o ranking direto das coleções.
 *
 * Faz 3 leituras de coleção e cruza tudo em memória, de propósito: a versão
 * anterior consultava reserva por reserva para cada usuário (~450 idas ao
 * Firestore com 150 jogadores), o que deixava a aba Ranking e o perfil dos
 * outros lentíssimos no celular. Além dos round-trips, aquele caminho lia a
 * mesma reserva uma vez por participante.
 */
export async function computeHoursRanking(): Promise<HoursRankingEntry[]> {
  const [usersSnap, reservationsSnap, participantsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'reservations')),
    getDocs(collection(db, 'reservationParticipants')),
  ]);

  const now = Date.now();

  // Reservas que já aconteceram e são jogo de verdade. Blocos 'organizing' do
  // "Quem anima?" moram na mesma coleção e não podem virar horas jogadas.
  const playedReservations = new Map<string, { createdById: string }>();
  for (const d of reservationsSnap.docs) {
    const data = d.data();
    if (data.type === 'organizing') continue;
    const endAt = data.endAt?.toDate?.();
    if (!endAt || endAt.getTime() > now) continue;
    playedReservations.set(d.id, { createdById: data.createdById ?? '' });
  }

  // userId -> ids de reservas, como Set porque quem criou também é participante.
  const byUser = new Map<string, Set<string>>();
  const add = (userId: string, reservationId: string) => {
    if (!userId) return;
    const set = byUser.get(userId);
    if (set) set.add(reservationId);
    else byUser.set(userId, new Set([reservationId]));
  };

  for (const [reservationId, r] of playedReservations) {
    add(r.createdById, reservationId);
  }
  for (const d of participantsSnap.docs) {
    const data = d.data();
    const reservationId = data.reservationId;
    if (!reservationId || !playedReservations.has(reservationId)) continue;
    add(data.userId, reservationId);
  }

  return usersSnap.docs
    .filter((userDoc) => !userDoc.data()?.isAnonymous)
    .map((userDoc) => {
      const user = userDoc.data();
      const count = byUser.get(userDoc.id)?.size ?? 0;
      return {
        id: userDoc.id,
        name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Jogador',
        initials: getInitials(user?.firstName, user?.lastName),
        pictureUrl: user?.pictureUrl,
        hours: Math.round(count * RESERVATION_DURATION_HOURS * 10) / 10,
        createdAt: user?.createdAt?.toDate?.() ?? new Date(0),
      };
    })
    .sort((a, b) =>
      b.hours !== a.hours ? b.hours - a.hours : a.createdAt.getTime() - b.createdAt.getTime()
    );
}

/**
 * Ranking geral por horas jogadas. Prefere o pré-calculado; se não houver,
 * calcula na hora.
 */
export async function getHoursRanking(): Promise<HoursRanking> {
  const cached = await readCachedRanking();
  if (cached) return cached;
  return { entries: await computeHoursRanking(), computedAt: null };
}
