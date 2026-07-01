/**
 * Criação e validação de reservas no app nativo.
 *
 * O app web cria reservas via rota de servidor (/api/reservations) usando
 * firebase-admin, que também dispara emails (Brevo). O app nativo não tem
 * backend próprio, então escrevemos direto no Firestore com o SDK cliente
 * (as regras em FIRESTORE_RULES.md permitem create para usuários autenticados).
 * A validação abaixo espelha src/lib/validators/reservationValidator.ts do web
 * para manter o mesmo comportamento — janela de 7 dias, duração conforme a
 * quadra, conflito de horário e limites por dia/semana.
 *
 * Diferença conhecida: emails de confirmação/participante NÃO são enviados
 * aqui (dependem do servidor). Ver [[quadra-livre]] skill.
 */
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CourtReservationRules, DurationMode } from '@/types';
import { normalizeCourtId } from '@/lib/courts';

const DEFAULT_FIXED_MINUTES = 90;
const DEFAULT_MAX_MINUTES = 300;

export interface CreateReservationInput {
  createdById: string;
  startAt: Date;
  /** Se omitido, é calculado a partir das regras da quadra (fixo = +fixedMinutes). */
  endAt?: Date;
  courtId: string;
  /** IDs dos outros jogadores (o criador é adicionado automaticamente). */
  participantIds: string[];
}

export interface ReservationValidationError {
  message: string;
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}`;
}

export async function getCourtRules(courtId: string): Promise<CourtReservationRules | null> {
  try {
    const snap = await getDoc(doc(db, 'courts', normalizeCourtId(courtId)));
    if (snap.exists()) {
      return (snap.data().reservationRules as CourtReservationRules) ?? null;
    }
  } catch {
    // sem regras → usa defaults
  }
  return null;
}

/** Fim padrão da reserva conforme as regras da quadra (fixo = +fixedMinutes). */
export function computeEndAt(startAt: Date, rules: CourtReservationRules | null): Date {
  const mode: DurationMode = rules?.durationMode ?? 'fixed';
  const fixedMinutes = rules?.fixedMinutes ?? DEFAULT_FIXED_MINUTES;
  const minutes = mode === 'fixed' ? fixedMinutes : fixedMinutes; // free/max: sugerimos o mesmo default
  return new Date(startAt.getTime() + minutes * 60 * 1000);
}

/**
 * Espelha validateReservation do web. Retorna null se válido, ou o erro.
 */
async function validateReservation(
  createdById: string,
  startAt: Date,
  endAt: Date,
  courtId: string,
  rules: CourtReservationRules | null
): Promise<ReservationValidationError | null> {
  const normalizedCourtId = normalizeCourtId(courtId);

  // 1. Janela de 7 dias
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 6);
  maxDate.setHours(23, 59, 59, 999);
  if (startAt < today || startAt > maxDate) {
    return { message: 'Reservas disponíveis apenas para os próximos 7 dias' };
  }

  // 2. Duração conforme regras da quadra
  const duration = (endAt.getTime() - startAt.getTime()) / (1000 * 60);
  if (duration <= 0) return { message: 'Duração inválida.' };

  const durationMode: DurationMode = rules?.durationMode ?? 'fixed';
  const fixedMinutes = rules?.fixedMinutes ?? DEFAULT_FIXED_MINUTES;
  const maxMinutes = rules?.maxMinutes ?? DEFAULT_MAX_MINUTES;
  const maxReservationsPerDay = rules?.maxReservationsPerDay ?? null;
  const maxReservationsPerWeek = rules?.maxReservationsPerWeek ?? null;

  if (durationMode === 'fixed' && duration !== fixedMinutes) {
    return { message: `A duração da reserva deve ser de ${formatMins(fixedMinutes)}` };
  }
  if (durationMode === 'max' && duration > maxMinutes) {
    return { message: `A duração máxima da reserva é de ${formatMins(maxMinutes)}` };
  }

  // 3. Conflito de horário na mesma quadra
  const conflictingSnap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('startAt', '<', Timestamp.fromDate(endAt)),
      where('endAt', '>', Timestamp.fromDate(startAt))
    )
  );
  const conflictDoc = conflictingSnap.docs.find(
    (d) => normalizeCourtId(d.data().courtId) === normalizedCourtId
  );
  if (conflictDoc) {
    const conflict = conflictDoc.data();
    const participantsSnap = await getDocs(
      query(
        collection(db, 'reservationParticipants'),
        where('reservationId', '==', conflictDoc.id)
      )
    );
    const names: string[] = [];
    for (const p of participantsSnap.docs) {
      const pData = p.data();
      if (pData.userId) {
        const uSnap = await getDoc(doc(db, 'users', pData.userId));
        if (uSnap.exists()) names.push(uSnap.data()?.firstName || 'Jogador');
      } else if (pData.guestName) {
        names.push(pData.guestName);
      }
    }
    const namesText = names.join(' e ');
    const verb = names.length === 1 ? 'vai jogar' : 'vão jogar';
    const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return {
      message: `${namesText} ${verb} das ${fmt(conflict.startAt.toDate())} às ${fmt(conflict.endAt.toDate())}, tente outro horário.`,
    };
  }

  // 4. Limite por dia
  if (maxReservationsPerDay != null && maxReservationsPerDay > 0) {
    const dayStart = new Date(startAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(startAt);
    dayEnd.setHours(23, 59, 59, 999);
    const daySnap = await getDocs(
      query(
        collection(db, 'reservations'),
        where('createdById', '==', createdById),
        where('startAt', '>=', Timestamp.fromDate(dayStart)),
        where('startAt', '<=', Timestamp.fromDate(dayEnd))
      )
    );
    const dayCount = daySnap.docs.filter(
      (d) => normalizeCourtId(d.data().courtId) === normalizedCourtId
    ).length;
    if (dayCount >= maxReservationsPerDay) {
      const limit = maxReservationsPerDay === 1 ? '1 reserva por dia' : `${maxReservationsPerDay} reservas por dia`;
      return { message: `Você atingiu o limite de ${limit} nesta quadra.` };
    }
  }

  // 5. Limite por semana
  if (maxReservationsPerWeek != null && maxReservationsPerWeek > 0) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekSnap = await getDocs(
      query(
        collection(db, 'reservations'),
        where('createdById', '==', createdById),
        where('startAt', '>=', Timestamp.fromDate(weekStart)),
        where('startAt', '<=', Timestamp.fromDate(weekEnd))
      )
    );
    const weekCount = weekSnap.docs.filter(
      (d) => normalizeCourtId(d.data().courtId) === normalizedCourtId
    ).length;
    if (weekCount >= maxReservationsPerWeek) {
      const limit = maxReservationsPerWeek === 1 ? '1 reserva por semana' : `${maxReservationsPerWeek} reservas por semana`;
      return { message: `Você atingiu o limite de ${limit} nesta quadra.` };
    }
  }

  return null;
}

/**
 * Cria a reserva no Firestore após validar. Lança um Error com mensagem
 * amigável se a validação falhar.
 */
export async function createReservation(input: CreateReservationInput): Promise<string> {
  const { createdById, startAt, courtId, participantIds } = input;
  const normalizedCourtId = normalizeCourtId(courtId);
  const rules = await getCourtRules(normalizedCourtId);
  const endAt = input.endAt ?? computeEndAt(startAt, rules);

  const error = await validateReservation(createdById, startAt, endAt, normalizedCourtId, rules);
  if (error) throw new Error(error.message);

  const batch = writeBatch(db);
  const reservationRef = doc(collection(db, 'reservations'));
  batch.set(reservationRef, {
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    createdById,
    createdAt: Timestamp.now(),
    courtId: normalizedCourtId,
  });

  // Criador é o primeiro participante (order 0), depois os demais.
  const creatorPartRef = doc(collection(db, 'reservationParticipants'));
  batch.set(creatorPartRef, { reservationId: reservationRef.id, userId: createdById, order: 0 });

  const others = participantIds.filter((id) => id && id !== createdById);
  others.forEach((userId, i) => {
    const partRef = doc(collection(db, 'reservationParticipants'));
    batch.set(partRef, { reservationId: reservationRef.id, userId, order: i + 1 });
  });

  await batch.commit();
  return reservationRef.id;
}
