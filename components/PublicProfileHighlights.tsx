import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/Avatar';
import { UserStats } from '@/lib/stats';
import {
  getPatenteAtual,
  getProgressoAteProxima,
  getProximaPatente,
} from '@/lib/patents';

const DAY_NAMES: Record<string, string> = {
  Dom: 'Domingo',
  Seg: 'Segunda',
  Ter: 'Terça',
  Qua: 'Quarta',
  Qui: 'Quinta',
  Sex: 'Sexta',
  Sáb: 'Sábado',
};

interface PublicProfileHighlightsProps {
  stats: UserStats;
  rankingPosition: number | null;
  rankingTotal: number;
  rankingLoading: boolean;
  onOpenClassification: () => void;
  onOpenProfile: (userId: string) => void;
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
}

export default function PublicProfileHighlights({
  stats,
  rankingPosition,
  rankingTotal,
  rankingLoading,
  onOpenClassification,
  onOpenProfile,
}: PublicProfileHighlightsProps) {
  const patente = getPatenteAtual(stats.totalHours);
  const proximaPatente = getProximaPatente(stats.totalHours);
  const progresso = getProgressoAteProxima(stats.totalHours);
  const favoriteDay = [...stats.dayStats].sort((a, b) => b.count - a.count)[0];
  const hasFavoriteDay = favoriteDay && favoriteDay.count > 0;
  const faltam = proximaPatente
    ? Math.max(0, proximaPatente.horasRequeridas - stats.totalHours)
    : 0;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Perfil em quadra</Text>

      <View style={styles.card}>
        <View style={styles.highlights}>
          <View style={styles.highlight}>
            <View style={styles.iconCircle}>
              <Ionicons name="trophy-outline" size={18} color="#059669" />
            </View>
            {rankingLoading ? (
              <ActivityIndicator size="small" color="#10b981" style={styles.loader} />
            ) : (
              <Text style={styles.highlightValue}>
                {rankingPosition ? `#${rankingPosition}` : '—'}
              </Text>
            )}
            <Text style={styles.highlightLabel}>
              {rankingTotal > 0 ? `Ranking de ${rankingTotal}` : 'Ranking geral'}
            </Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.highlight}>
            <View style={styles.iconCircle}>
              <Ionicons name="ribbon-outline" size={18} color="#059669" />
            </View>
            <Text style={styles.highlightValue}>{patente.nome}</Text>
            <Text style={styles.highlightLabel}>Patente atual</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.highlight}>
            <View style={styles.iconCircle}>
              <Ionicons name="calendar-outline" size={18} color="#059669" />
            </View>
            <Text style={styles.highlightValue}>
              {hasFavoriteDay ? DAY_NAMES[favoriteDay.day] : '—'}
            </Text>
            <Text style={styles.highlightLabel}>Dia favorito</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.progressArea}
          onPress={onOpenClassification}
          activeOpacity={0.75}
        >
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Jornada de classificação</Text>
            <Ionicons name="chevron-forward" size={17} color="#9ca3af" />
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round((proximaPatente ? progresso : 1) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressCaption}>
            {proximaPatente
              ? `Faltam ${formatHours(faltam)}h para ${proximaPatente.nome}`
              : 'Patente máxima alcançada'}
          </Text>
        </TouchableOpacity>
      </View>

      {stats.topPartners.length > 0 && (
        <View style={styles.card}>
          <View style={styles.partnersHeader}>
            <Ionicons name="people-outline" size={18} color="#059669" />
            <Text style={styles.partnersTitle}>Parceiros frequentes</Text>
          </View>
          <View style={styles.partners}>
            {stats.topPartners.slice(0, 3).map((partner) => (
              <TouchableOpacity
                key={partner.userId}
                style={styles.partner}
                onPress={() => onOpenProfile(partner.userId)}
                activeOpacity={0.7}
              >
                <Avatar
                  uri={partner.pictureUrl}
                  initials={partner.initials}
                  size={42}
                  fontSize={14}
                />
                <View style={styles.partnerText}>
                  <Text style={styles.partnerName} numberOfLines={1}>
                    {partner.name}
                  </Text>
                  <Text style={styles.partnerGames}>
                    {partner.count} {partner.count === 1 ? 'jogo junto' : 'jogos juntos'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  highlights: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  highlight: { flex: 1, alignItems: 'center', minWidth: 0 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  loader: { height: 22 },
  highlightValue: {
    minHeight: 22,
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  highlightLabel: { fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 1 },
  verticalDivider: { width: 1, backgroundColor: '#f3f4f6', marginVertical: 6 },
  progressArea: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#10b981' },
  progressCaption: { fontSize: 11, color: '#6b7280', marginTop: 6 },
  partnersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 8,
  },
  partnersTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  partners: { paddingHorizontal: 15, paddingBottom: 8 },
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  partnerText: { flex: 1, minWidth: 0 },
  partnerName: { fontSize: 13, fontWeight: '700', color: '#374151' },
  partnerGames: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
});
