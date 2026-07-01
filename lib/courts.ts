export const DEVELOPER_EMAIL = 'admin@quadralivre.com';

export const COURTS = [
  { id: 'quadra_1', name: 'Igrejinha' },
  { id: 'quadra_2', name: 'Três Coroas' },
] as const;

export type CourtId = typeof COURTS[number]['id'];

export const DEFAULT_COURT_ID: CourtId = 'quadra_1';

export function getCourtName(courtId: string): string {
  return COURTS.find((c) => c.id === courtId)?.name ?? courtId;
}

export function normalizeCourtId(courtId: string | undefined | null): CourtId {
  if (courtId === 'quadra_2') return 'quadra_2';
  return 'quadra_1';
}
