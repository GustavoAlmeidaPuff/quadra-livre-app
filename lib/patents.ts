/**
 * Patentes por horas jogadas. Espelha src/lib/patents.ts do app web —
 * ids, nomes e horas precisam bater nos dois clientes, senão o mesmo jogador
 * vê patentes diferentes dependendo de onde abriu.
 *
 * Calibrado para ~1×/semana × 1.5h ≈ 6h/mês → ~1.5 ano até Profissional (100h).
 */
export const PATENTES = [
  { id: 'iniciante', nome: 'Iniciante', horasRequeridas: 0, icon: 'target' },
  { id: 'amador', nome: 'Amador', horasRequeridas: 10, icon: 'star' },
  { id: 'intermediario', nome: 'Intermediário', horasRequeridas: 40, icon: 'zap' },
  { id: 'avancado', nome: 'Avançado', horasRequeridas: 80, icon: 'flame' },
  { id: 'profissional', nome: 'Profissional', horasRequeridas: 100, icon: 'gem' },
] as const;

export type PatenteId = (typeof PATENTES)[number]['id'];

export interface PatenteInfo {
  id: PatenteId;
  nome: string;
  horasRequeridas: number;
  icon: string;
  isAlcancada: boolean;
  isAtual: boolean;
}

export function getPatenteAtual(horasJogadas: number): (typeof PATENTES)[number] {
  for (let i = PATENTES.length - 1; i >= 0; i--) {
    if (horasJogadas >= PATENTES[i].horasRequeridas) {
      return PATENTES[i];
    }
  }
  return PATENTES[0];
}

export function getTodasPatentesComStatus(horasJogadas: number): PatenteInfo[] {
  const patenteAtual = getPatenteAtual(horasJogadas);
  return PATENTES.map((p) => ({
    ...p,
    isAlcancada: horasJogadas >= p.horasRequeridas,
    isAtual: p.id === patenteAtual.id,
  }));
}

/**
 * Progresso até a próxima patente (0 a 1).
 * Se já está na última patente, retorna 1.
 */
export function getProgressoAteProxima(horasJogadas: number): number {
  const current = getPatenteAtual(horasJogadas);
  const currentIndex = PATENTES.indexOf(current);
  if (currentIndex >= PATENTES.length - 1) return 1;
  const next = PATENTES[currentIndex + 1];
  const delta = next.horasRequeridas - current.horasRequeridas;
  if (delta <= 0) return 1;
  const progress = (horasJogadas - current.horasRequeridas) / delta;
  return Math.min(1, Math.max(0, progress));
}

/** Próxima patente a ser conquistada, ou null se já está no topo. */
export function getProximaPatente(horasJogadas: number): (typeof PATENTES)[number] | null {
  const currentIndex = PATENTES.indexOf(getPatenteAtual(horasJogadas));
  return currentIndex >= PATENTES.length - 1 ? null : PATENTES[currentIndex + 1];
}
