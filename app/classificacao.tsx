import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { getUserTotalHours } from '@/lib/stats';
import {
  PatenteInfo,
  getPatenteAtual,
  getProgressoAteProxima,
  getProximaPatente,
  getTodasPatentesComStatus,
  PATENTES,
} from '@/lib/patents';

/** Ionicons equivalentes aos ícones lucide usados no web. */
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  target: 'locate',
  star: 'star',
  zap: 'flash',
  flame: 'flame',
  gem: 'diamond',
};

/** Cada patente ganha sua cor: a trilha inteira vira uma progressão visível. */
const PATENTE_COLORS: Record<string, { base: string; dark: string; soft: string }> = {
  iniciante: { base: '#34d399', dark: '#10b981', soft: '#d1fae5' },
  amador: { base: '#10b981', dark: '#059669', soft: '#d1fae5' },
  intermediario: { base: '#0ea5e9', dark: '#0284c7', soft: '#e0f2fe' },
  avancado: { base: '#f59e0b', dark: '#d97706', soft: '#fef3c7' },
  profissional: { base: '#8b5cf6', dark: '#7c3aed', soft: '#ede9fe' },
};

const LOCKED = { base: '#f3f4f6', dark: '#e5e7eb', soft: '#f9fafb' };

const NODE = 76;
const NODE_LIFT = 6; // "altura" do botão 3D
const ROW_H = 168;
const TOP_PAD = 12;
const LABEL_BLOCK = NODE + NODE_LIFT + 8 + 34; // nó + respiro + nome/horas
const DOT_SIZE = 8;
const DOT_TS = [0.16, 0.5, 0.84];

function colorsFor(patente: PatenteInfo) {
  return patente.isAlcancada ? PATENTE_COLORS[patente.id] ?? PATENTE_COLORS.iniciante : LOCKED;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',');
}

export default function ClassificacaoScreen() {
  const { firebaseUser, appUser } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const viewedUserId = userId || firebaseUser?.uid || '';
  const isOwnProfile = !userId || userId === firebaseUser?.uid;

  const { width } = useWindowDimensions();
  const contentW = Math.min(width - 40, 420);
  const centerX = contentW / 2;
  const swing = Math.min(66, contentW * 0.2);

  const [hours, setHours] = useState<number | null>(null);
  const [name, setName] = useState<string>('Jogador');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!viewedUserId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);

    async function load() {
      try {
        const [totalHours, userSnap] = await Promise.all([
          getUserTotalHours(viewedUserId),
          isOwnProfile && appUser ? Promise.resolve(null) : getDoc(doc(db, 'users', viewedUserId)),
        ]);
        if (cancelled) return;
        setHours(totalHours);
        if (userSnap && userSnap.exists()) {
          const u = userSnap.data();
          setName(`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'Jogador');
        } else if (appUser) {
          setName(`${appUser.firstName ?? ''} ${appUser.lastName ?? ''}`.trim() || 'Jogador');
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewedUserId, isOwnProfile, appUser]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Não foi possível carregar os dados.</Text>
      </View>
    );
  }

  const totalHours = hours ?? 0;
  const patentes = getTodasPatentesComStatus(totalHours);
  const patenteAtual = getPatenteAtual(totalHours);
  const currentIndex = PATENTES.findIndex((p) => p.id === patenteAtual.id);
  const progresso = getProgressoAteProxima(totalHours);
  const proxima = getProximaPatente(totalHours);
  const faltam = proxima ? Math.max(0, Math.round((proxima.horasRequeridas - totalHours) * 10) / 10) : 0;
  const heroColors = PATENTE_COLORS[patenteAtual.id] ?? PATENTE_COLORS.iniciante;

  // Quanto da trilha já foi percorrido, em "segmentos" entre nós.
  const totalProgress = currentIndex + (proxima ? progresso : 0);

  const nodeX = (i: number) => centerX + Math.round(Math.sin((i * Math.PI) / 2) * swing);
  const nodeTop = (i: number) => TOP_PAD + i * ROW_H;
  const pathHeight = TOP_PAD + (patentes.length - 1) * ROW_H + LABEL_BLOCK + 8;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Herói: patente atual */}
      <View style={[styles.hero, { backgroundColor: heroColors.soft, borderColor: heroColors.base + '55' }]}>
        <HeroBadge colors={heroColors} icon={patenteAtual.icon} />

        <Text style={styles.heroName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.heroPatente, { color: heroColors.dark }]}>{patenteAtual.nome}</Text>

        <View style={[styles.hoursChip, { backgroundColor: '#ffffff', borderColor: heroColors.base + '55' }]}>
          <Ionicons name="time-outline" size={14} color={heroColors.dark} />
          <Text style={[styles.hoursChipText, { color: heroColors.dark }]}>
            {formatHours(totalHours)}h jogadas
          </Text>
        </View>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <ProgressFill progress={proxima ? progresso : 1} color={heroColors.base} />
          </View>
          <Text style={styles.progressText}>
            {proxima
              ? `Faltam ${formatHours(faltam)}h para ${proxima.nome}`
              : 'Patente máxima alcançada 🏆'}
          </Text>
        </View>
      </View>

      {/* Trilha */}
      <Text style={styles.sectionTitle}>Sua jornada</Text>

      <View style={[styles.path, { width: contentW, height: pathHeight }]}>
        {/* Rastro pontilhado entre os nós */}
        {patentes.slice(0, -1).map((patente, i) => {
          const fill = Math.min(1, Math.max(0, totalProgress - i));
          const xA = nodeX(i);
          const xB = nodeX(i + 1);
          const yStart = nodeTop(i) + LABEL_BLOCK;
          const gap = nodeTop(i + 1) - yStart;
          const trailColor = PATENTE_COLORS[patente.id]?.base ?? '#10b981';

          return DOT_TS.map((t, k) => {
            const on = fill >= t;
            return (
              <View
                key={`${patente.id}-dot-${k}`}
                style={[
                  styles.dot,
                  {
                    left: xA + (xB - xA) * t - DOT_SIZE / 2,
                    top: yStart + gap * t - DOT_SIZE / 2,
                    backgroundColor: on ? trailColor : '#e5e7eb',
                  },
                ]}
              />
            );
          });
        })}

        {/* Nós */}
        {patentes.map((patente, i) => (
          <PatenteNode
            key={patente.id}
            patente={patente}
            index={i}
            left={nodeX(i) - 70}
            top={nodeTop(i)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

/** Badge grande do topo, com halo pulsando. */
function HeroBadge({ colors, icon }: { colors: { base: string; dark: string }; icon: string }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 0.9 + pulse.value * 0.45 }],
  }));

  return (
    <View style={styles.heroBadgeWrap}>
      <Animated.View
        style={[styles.heroHalo, { backgroundColor: colors.base }, haloStyle]}
        pointerEvents="none"
      />
      <View style={[styles.heroBadgeShadow, { backgroundColor: colors.dark }]} />
      <View style={[styles.heroBadge, { backgroundColor: colors.base }]}>
        <Ionicons name={ICON_MAP[icon] ?? 'locate'} size={44} color="#ffffff" />
      </View>
    </View>
  );
}

/** Barra de progresso até a próxima patente. */
function ProgressFill({ progress, color }: { progress: number; color: string }) {
  const value = useSharedValue(0);

  useEffect(() => {
    value.value = withDelay(
      200,
      withTiming(progress, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
  }, [progress, value]);

  const style = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, value.value)) * 100}%`,
  }));

  return <Animated.View style={[styles.progressFill, { backgroundColor: color }, style]} />;
}

function PatenteNode({
  patente,
  index,
  left,
  top,
}: {
  patente: PatenteInfo;
  index: number;
  left: number;
  top: number;
}) {
  const colors = colorsFor(patente);
  const enter = useSharedValue(0);
  const pulse = useSharedValue(0);
  const bubble = useSharedValue(0);

  useEffect(() => {
    enter.value = withDelay(
      index * 110,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.6)) })
    );
  }, [enter, index]);

  useEffect(() => {
    if (!patente.isAtual) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    bubble.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [patente.isAtual, pulse, bubble]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.6 + enter.value * 0.4 }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - pulse.value),
    transform: [{ scale: 0.85 + pulse.value * 0.5 }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -4 * bubble.value }],
  }));

  const iconName = patente.isAlcancada ? ICON_MAP[patente.icon] ?? 'locate' : 'lock-closed';

  return (
    <Animated.View style={[styles.nodeWrap, { left, top }, enterStyle]}>
      {patente.isAtual && (
        <Animated.View style={[styles.bubble, { borderColor: colors.base }, bubbleStyle]}>
          <Text style={[styles.bubbleText, { color: colors.dark }]}>VOCÊ ESTÁ AQUI</Text>
          <View style={[styles.bubbleTail, { borderColor: colors.base }]} />
        </Animated.View>
      )}

      <View style={styles.nodeStack}>
        {patente.isAtual && (
          <Animated.View
            style={[styles.nodeHalo, { backgroundColor: colors.base }, haloStyle]}
            pointerEvents="none"
          />
        )}
        <View style={[styles.nodeShadow, { backgroundColor: colors.dark }]} />
        <View
          style={[
            styles.node,
            { backgroundColor: colors.base },
            patente.isAtual && styles.nodeCurrent,
          ]}
        >
          <Ionicons
            name={iconName}
            size={patente.isAlcancada ? 32 : 26}
            color={patente.isAlcancada ? '#ffffff' : '#c7cbd2'}
          />
        </View>

        {patente.isAlcancada && !patente.isAtual && (
          <View style={[styles.checkBadge, { backgroundColor: colors.dark }]}>
            <Ionicons name="checkmark" size={13} color="#ffffff" />
          </View>
        )}
      </View>

      <Text
        style={[styles.nodeName, !patente.isAlcancada && styles.nodeNameLocked]}
        numberOfLines={1}
      >
        {patente.nome}
      </Text>
      <Text style={styles.nodeHours}>{patente.horasRequeridas}h</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 48, alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  errorText: { fontSize: 14, color: '#dc2626' },

  // Herói
  hero: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroBadgeWrap: {
    width: 104,
    height: 104 + NODE_LIFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroHalo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  heroBadgeShadow: {
    position: 'absolute',
    top: NODE_LIFT + 4,
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  heroBadge: {
    position: 'absolute',
    top: 4,
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  heroPatente: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  hoursChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  hoursChipText: { fontSize: 13, fontWeight: '700' },

  progressWrap: { width: '100%', marginTop: 18, alignItems: 'center' },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5 },
  progressText: { fontSize: 12.5, color: '#6b7280', fontWeight: '600', marginTop: 8 },

  sectionTitle: {
    alignSelf: 'flex-start',
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginTop: 28,
    marginBottom: 4,
  },

  // Trilha
  path: { position: 'relative' },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },

  nodeWrap: { position: 'absolute', width: 140, alignItems: 'center' },
  nodeStack: { width: NODE, height: NODE + NODE_LIFT, alignItems: 'center', justifyContent: 'center' },
  nodeHalo: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    top: 0,
  },
  nodeShadow: {
    position: 'absolute',
    top: NODE_LIFT,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
  },
  node: {
    position: 'absolute',
    top: 0,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCurrent: {
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  checkBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f9fafb',
  },

  bubble: {
    position: 'absolute',
    top: -34,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 2,
  },
  bubbleText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  bubbleTail: {
    position: 'absolute',
    bottom: -5,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },

  nodeName: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 10 },
  nodeNameLocked: { color: '#9ca3af' },
  nodeHours: { fontSize: 12, color: '#9ca3af', fontWeight: '600', marginTop: 1 },
});
