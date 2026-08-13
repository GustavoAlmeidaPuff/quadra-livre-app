import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapWeatherCode, WeatherHour, WeatherIcon } from '@/lib/weather';

const ICONS: Record<WeatherIcon, React.ComponentProps<typeof Ionicons>['name']> = {
  sun: 'sunny',
  moon: 'moon',
  partly: 'partly-sunny',
  'partly-night': 'cloudy-night',
  cloud: 'cloudy',
  fog: 'cloudy-outline',
  drizzle: 'rainy-outline',
  rain: 'rainy',
  storm: 'thunderstorm',
  snow: 'snow',
};

const ICON_COLORS: Record<WeatherIcon, string> = {
  sun: '#f59e0b',
  moon: '#94a3b8',
  partly: '#f59e0b',
  'partly-night': '#94a3b8',
  cloud: '#9ca3af',
  fog: '#9ca3af',
  drizzle: '#60a5fa',
  rain: '#3b82f6',
  storm: '#6366f1',
  snow: '#93c5fd',
};

/** Quanto maior a chance de chuva, mais a porcentagem chama atenção. */
function rainColor(chance: number): string {
  if (chance >= 70) return '#2563eb';
  if (chance >= 50) return '#d97706';
  return '#9ca3af';
}

/**
 * Ícone do tempo + chance de chuva de uma hora.
 * Sem previsão (fora da janela de 7 dias ou sem rede) não renderiza nada.
 */
export default function WeatherBadge({
  hour,
  iconSize = 14,
  showChance = true,
}: {
  hour: WeatherHour | undefined;
  iconSize?: number;
  showChance?: boolean;
}) {
  if (!hour) return null;
  const { icon } = mapWeatherCode(hour.code, hour.isDay);

  return (
    <View style={styles.row}>
      <Ionicons name={ICONS[icon]} size={iconSize} color={ICON_COLORS[icon]} />
      {showChance && (
        <Text style={[styles.chance, { color: rainColor(hour.rainChance) }]}>{hour.rainChance}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chance: { fontSize: 10, fontWeight: '600' },
});
