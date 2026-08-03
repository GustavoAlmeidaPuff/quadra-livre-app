/**
 * Telefone para o botão de WhatsApp do "Quem anima?".
 *
 * Guardamos sempre em E.164 sem o "+" (ex.: 5551999998888), que é o formato
 * que o wa.me espera. A digitação é em formato brasileiro, sem o DDI.
 */

const BR_COUNTRY_CODE = '55';

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Máscara de digitação: (51) 99999-8888 ou (51) 3333-4444. */
export function maskPhoneBR(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** DDD + número, 10 (fixo) ou 11 (celular) dígitos. */
export function isValidPhoneBR(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

/** Converte o que foi digitado para o formato guardado no Firestore. */
export function toStoredPhone(value: string): string {
  return `${BR_COUNTRY_CODE}${onlyDigits(value)}`;
}

/** Volta do formato guardado para a máscara de exibição. */
export function fromStoredPhone(stored?: string | null): string {
  if (!stored) return '';
  const d = onlyDigits(stored);
  const local = d.startsWith(BR_COUNTRY_CODE) ? d.slice(BR_COUNTRY_CODE.length) : d;
  return maskPhoneBR(local);
}
