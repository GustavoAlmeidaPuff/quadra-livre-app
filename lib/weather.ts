/**
 * Previsão do tempo hora a hora para a agenda.
 *
 * Fonte: Open-Meteo (https://open-meteo.com) — sem chave de API, sem cadastro,
 * 10.000 requisições/dia por IP. Como cada celular tem o próprio IP, na prática
 * o limite é por usuário. Licença CC BY 4.0: a atribuição aparece em
 * `app/configuracoes.tsx`.
 *
 * O plano gratuito é não-comercial (vale para apps sem anúncio e sem assinatura).
 * Se o Quadra Livre passar a ter reserva paga ou publicidade, é preciso migrar
 * para o plano Standard ou trocar de provedor.
 *
 * A previsão é sempre opcional: qualquer falha aqui deixa a agenda sem ícones,
 * nunca vira `ErrorState` ou toast.
 *
 * Este módulo é espelhado em `quadra-tenis-igrejinha/src/lib/weather.ts`
 * (mesma lógica, `localStorage` no lugar do `AsyncStorage`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCourtCoords, normalizeCourtId } from './courts';

const API_URL = 'https://api.open-meteo.com/v1/forecast';
const HOURLY_VARS = 'temperature_2m,precipitation_probability,weather_code,is_day';
const TIMEZONE = 'America/Sao_Paulo';
/** A agenda mostra hoje + 6 dias, então 7 dias de previsão cobrem a janela inteira. */
const FORECAST_DAYS = 7;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — a Open-Meteo só recalcula de hora em hora

export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'partly'
  | 'partly-night'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'storm'
  | 'snow';

export interface WeatherHour {
  /** Código WMO devolvido pela API. */
  code: number;
  isDay: boolean;
  tempC: number;
  /** Chance de precipitação na hora, 0–100. */
  rainChance: number;
}

/** Chave no formato `YYYY-MM-DDTHH` (hora local). */
export type WeatherHours = Record<string, WeatherHour>;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Monta a chave de consulta em horário local — de propósito sem `toISOString()`,
 * que jogaria a data para UTC (mesmo motivo dos helpers `dateKey`/`localISO`).
 */
export function hourKey(date: Date, hour: number = date.getHours()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}`;
}

/** Tabela WMO → ícone e rótulo. Ver https://open-meteo.com/en/docs */
export function mapWeatherCode(code: number, isDay: boolean): { icon: WeatherIcon; label: string } {
  switch (code) {
    case 0:
      return { icon: isDay ? 'sun' : 'moon', label: 'Céu limpo' };
    case 1:
    case 2:
      return { icon: isDay ? 'partly' : 'partly-night', label: 'Parcialmente nublado' };
    case 3:
      return { icon: 'cloud', label: 'Nublado' };
    case 45:
    case 48:
      return { icon: 'fog', label: 'Neblina' };
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return { icon: 'drizzle', label: 'Garoa' };
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
      return { icon: 'rain', label: 'Chuva' };
    case 80:
    case 81:
    case 82:
      return { icon: 'rain', label: 'Pancadas de chuva' };
    case 95:
    case 96:
    case 99:
      return { icon: 'storm', label: 'Tempestade' };
    // Neve não acontece em Igrejinha/Três Coroas, mas o código existe na tabela.
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return { icon: 'snow', label: 'Neve' };
    default:
      return { icon: 'cloud', label: 'Tempo instável' };
  }
}

/** Ordena as condições da mais branda para a mais severa (usado ao resumir um intervalo). */
export function weatherSeverity(code: number): number {
  const { icon } = mapWeatherCode(code, true);
  const order: WeatherIcon[] = [
    'sun',
    'moon',
    'partly',
    'partly-night',
    'cloud',
    'fog',
    'drizzle',
    'snow',
    'rain',
    'storm',
  ];
  return order.indexOf(icon);
}

/**
 * Resume o tempo do intervalo de uma reserva: a condição mais severa entre as
 * horas cobertas, com a maior chance de chuva do período. Uma reserva de 90min
 * às 19:00 cobre as horas 19 e 20.
 */
export function summarizeRange(hours: WeatherHours, start: Date, end: Date): WeatherHour | null {
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  const lastMs = end.getTime() - 1; // 19:00–20:00 cobre só a hora 19

  let worst: WeatherHour | null = null;
  let maxRain = 0;
  while (cursor.getTime() <= lastMs) {
    const h = hours[hourKey(cursor)];
    if (h) {
      if (!worst || weatherSeverity(h.code) > weatherSeverity(worst.code)) worst = h;
      if (h.rainChance > maxRain) maxRain = h.rainChance;
    }
    cursor.setHours(cursor.getHours() + 1);
  }
  return worst ? { ...worst, rainChance: maxRain } : null;
}

/** A resposta vem em arrays paralelos, todos alinhados por índice com `hourly.time`. */
function parseForecast(json: any): WeatherHours {
  const hourly = json?.hourly;
  const times: unknown = hourly?.time;
  if (!Array.isArray(times)) return {};

  const out: WeatherHours = {};
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (typeof t !== 'string') continue;
    // "2026-08-13T00:00" já vem em hora local (timezone na query): basta cortar os minutos.
    out[t.slice(0, 13)] = {
      code: hourly.weather_code?.[i] ?? 0,
      isDay: hourly.is_day?.[i] === 1,
      tempC: Math.round(hourly.temperature_2m?.[i] ?? 0),
      rainChance: hourly.precipitation_probability?.[i] ?? 0,
    };
  }
  return out;
}

export async function fetchForecast(courtId: string): Promise<WeatherHours> {
  const { lat, lon } = getCourtCoords(courtId);
  const url =
    `${API_URL}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}` +
    `&timezone=${encodeURIComponent(TIMEZONE)}` +
    `&forecast_days=${FORECAST_DAYS}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo respondeu ${res.status}`);
    return parseForecast(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

interface CacheEntry {
  fetchedAt: number;
  hours: WeatherHours;
}

function cacheKey(courtId: string): string {
  return `weather:v1:${normalizeCourtId(courtId)}`;
}

async function readCache(courtId: string): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(courtId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    return typeof parsed?.fetchedAt === 'number' && parsed.hours ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(courtId: string, hours: WeatherHours): Promise<void> {
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), hours };
    await AsyncStorage.setItem(cacheKey(courtId), JSON.stringify(entry));
  } catch {
    // Cache é conveniência: sem ele a busca simplesmente refaz na próxima abertura.
  }
}

/**
 * Previsão da quadra, com cache de 1h. Troca de quadra refaz a busca (cada quadra
 * tem o próprio cache). `refresh()` ignora o TTL — ligado ao pull-to-refresh da agenda.
 */
export function useWeather(courtId: string): { hours: WeatherHours; refresh: () => void } {
  const [hours, setHours] = useState<WeatherHours>({});
  // Cada carregamento pega um token; só o mais recente pode escrever no estado.
  // Impede que uma busca lenta da quadra anterior sobrescreva a quadra atual.
  const tokenRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const token = ++tokenRef.current;
      const cached = await readCache(courtId);
      if (token !== tokenRef.current) return;
      // Troca atômica: ou mostra o cache da quadra nova, ou esvazia — nunca mistura quadras.
      setHours(cached?.hours ?? {});

      if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;

      try {
        const fresh = await fetchForecast(courtId);
        if (token !== tokenRef.current) return;
        setHours(fresh);
        await writeCache(courtId, fresh);
      } catch {
        // Sem rede a agenda segue normal, com o último cache (mesmo vencido) ou sem ícones.
      }
    },
    [courtId]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { hours, refresh };
}
