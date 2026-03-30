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
}

export interface Reservation {
  id: string;
  startAt: Timestamp;
  endAt: Timestamp;
  createdById: string;
  createdAt: Timestamp;
  courtId?: string;
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
