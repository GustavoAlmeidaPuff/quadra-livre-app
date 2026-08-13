export const DEVELOPER_EMAIL = 'admin@quadralivre.com';

export const COURTS = [
  { id: 'quadra_1', name: 'Igrejinha', lat: -29.5717, lon: -50.7906 },
  { id: 'quadra_2', name: 'Três Coroas', lat: -29.5178, lon: -50.7783 },
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

/** Coordenadas da quadra — usadas para buscar a previsão do tempo daquele local. */
export function getCourtCoords(courtId: string | undefined | null): { lat: number; lon: number } {
  const id = normalizeCourtId(courtId);
  const court = COURTS.find((c) => c.id === id) ?? COURTS[0];
  return { lat: court.lat, lon: court.lon };
}
