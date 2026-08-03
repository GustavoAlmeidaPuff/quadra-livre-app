import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  pictureUrl?: string;
  isAnonymous: boolean;
  isPrivate?: boolean;
  createdAt: Timestamp;
  welcomePopupSeen?: boolean;
  courtIds?: string[];
  /** Telefone no formato só-dígitos com DDI (ex.: 5551999998888). Pedido uma vez. */
  phone?: string | null;
  /** Token do Expo para push. Gravado no login, em aparelho físico. */
  expoPushToken?: string | null;
  notifyQuemAnima?: boolean;
  notifyChallenges?: boolean;
  notifyComments?: boolean;
}

/**
 * 'organizing' é o bloco cinza criado por um post do "Quem anima?": segura o
 * horário na agenda enquanto o jogo está sendo articulado, mas não é um jogo
 * de verdade — não conta horas, nem parceiros, nem deixa a quadra "ocupada".
 * Ausente = 'game' (todas as reservas criadas antes desta feature).
 */
export type ReservationType = 'game' | 'organizing';

export interface Reservation {
  id: string;
  startAt: Timestamp;
  endAt: Timestamp;
  createdById: string;
  createdAt: Timestamp;
  courtId?: string;
  type?: ReservationType;
  /** Preenchido quando type === 'organizing': post que originou o bloco. */
  quemAnimaPostId?: string;
}

export interface ReservationParticipant {
  id: string;
  reservationId: string;
  userId?: string;
  guestName?: string;
  order: number;
}

export interface Post {
  id: string;
  authorId: string;
  content: string;
  imageUrl?: string | null;
  createdAt: Timestamp;
}

export interface Challenge {
  id: string;
  fromUserId: string;
  toUserId: string;
  message?: string;
  status: 'pending' | 'pending_schedule' | 'accepted' | 'declined' | 'cancelled';
  createdAt: Timestamp;
  reservationId?: string;
}

// ---------- Quem anima? ----------

/** Formato de jogo procurado. 'ambos' = tanto faz simples ou duplas. */
export type GameFormat = '1x1' | '2x2' | 'ambos';

/** 'fixed' = hora marcada (gera bloco na agenda). 'tbd' = "a combinar". */
export type QuemAnimaTimeMode = 'fixed' | 'tbd';

export type QuemAnimaStatus = 'open' | 'closed' | 'cancelled';

export interface QuemAnimaPost {
  id: string;
  authorId: string;
  courtId: string;
  format: GameFormat;
  /** Dia do jogo, YYYY-MM-DD no fuso local. Sempre presente. */
  dateISO: string;
  timeMode: QuemAnimaTimeMode;
  /** Só quando timeMode === 'fixed'. */
  startAt?: Timestamp | null;
  endAt?: Timestamp | null;
  description: string;
  /** Contato por WhatsApp ligado no post. */
  showWhatsapp: boolean;
  /** Cópia do telefone no momento do post, para o link não quebrar se ele mudar. */
  whatsappPhone?: string | null;
  allowComments: boolean;
  /** Jogadores já combinados na criação do post. */
  confirmedUserIds: string[];
  /** Quem clicou em "Eu animo!". */
  interestedUserIds: string[];
  status: QuemAnimaStatus;
  commentCount: number;
  /** Bloco cinza na agenda, quando timeMode === 'fixed'. */
  organizingReservationId?: string | null;
  /** Reserva definitiva, preenchida ao clicar em "Fechou!". */
  reservationId?: string | null;
  createdAt: Timestamp;
  closedAt?: Timestamp | null;
}

export interface QuemAnimaComment {
  id: string;
  authorId: string;
  content: string;
  createdAt: Timestamp;
}

export type NotificationType =
  | 'quem_anima_novo'
  | 'quem_anima_interesse'
  | 'quem_anima_comentario'
  | 'quem_anima_adicionado'
  | 'challenge'
  | 'mention'
  | 'like'
  | 'info';

export interface AppNotification {
  id: string;
  toUserId: string;
  fromUserId?: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: Timestamp;
  /** Alvo do deep link ao tocar na notificação. */
  quemAnimaPostId?: string;
  postId?: string;
}

export type DurationMode = 'fixed' | 'free' | 'max';

export interface CourtReservationRules {
  durationMode: DurationMode;
  fixedMinutes: number;
  maxMinutes: number;
  maxReservationsPerDay?: number | null;
  maxReservationsPerWeek?: number | null;
}

export interface Court {
  id: string;
  name: string;
  managerIds: string[];
  createdAt: Timestamp;
  createdBy: string;
  reservationRules?: CourtReservationRules;
}

export interface CourtStatus {
  isOccupied: boolean;
  participants?: string[];
  reservation?: Reservation;
}
