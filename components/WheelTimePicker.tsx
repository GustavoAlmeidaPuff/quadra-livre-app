import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

/**
 * Seletor de hora estilo "drum/wheel" — o padrão nativo de iOS/Android para
 * escolher horário. Colunas roláveis com uma faixa central destacando o valor
 * selecionado. Sem dependências nativas: funciona em iOS, Android e web.
 *
 * Só usado no app nativo; o app web usa <select> (ver [[quadra-livre]] skill).
 */

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // deve ser ímpar para ter um centro
const CENTER_OFFSET = Math.floor(VISIBLE_ITEMS / 2);
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

interface WheelColumnProps {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  suffix?: string;
}

function WheelColumn({ values, selectedIndex, onChange, suffix }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(selectedIndex);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Posiciona no valor inicial. No nativo, onContentSizeChange é confiável (o
  // conteúdo já está medido quando dispara). Na web o posicionamento é feito no
  // efeito web abaixo (via rAF), porque aqui o scrollTo era limitado a 0 e a roda
  // abria no primeiro item (ex.: 06h) mesmo com a hora real sendo 19h.
  const didInit = useRef(false);
  const onContentSizeChange = () => {
    if (Platform.OS === 'web' || didInit.current) return;
    didInit.current = true;
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  };

  const indexFromOffset = (y: number) =>
    Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_HEIGHT)));

  // "Imã": ao parar de rolar, centraliza no número mais próximo e confirma o valor.
  // Feito manualmente (não só via snapToInterval) porque onMomentumScrollEnd não
  // dispara de forma confiável na web — sem isto, soltar entre dois números deixava
  // a roda torta e não atualizava a hora.
  const snapTo = (offsetY: number) => {
    const idx = indexFromOffset(offsetY);
    const target = idx * ITEM_HEIGHT;
    if (Math.abs(offsetY - target) > 0.5) {
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }
    setActive(idx);
    onChange(idx);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = indexFromOffset(y);
    if (idx !== active) setActive(idx);
    // Debounce: quando os eventos de scroll param, o imã age.
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => snapTo(y), 110);
  };

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTo(e.nativeEvent.contentOffset.y);
  };

  // Sempre aponta pro snapTo mais recente (evita closure velha nos handlers de mouse).
  const snapToRef = useRef(snapTo);
  snapToRef.current = snapTo;

  useEffect(() => () => { if (snapTimer.current) clearTimeout(snapTimer.current); }, []);

  // Web: posicionamento inicial robusto + arraste com o mouse (pra testes).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = (scrollRef.current as any)?.getScrollableNode?.();
    if (!node) return;

    // Posiciona no valor inicial assim que o conteúdo tiver altura suficiente.
    // (No layout inicial scrollHeight ainda é pequeno e o scroll seria limitado a 0.)
    const target = selectedIndex * ITEM_HEIGHT;
    let raf = 0;
    let tries = 0;
    const positionInit = () => {
      if (node.scrollHeight - node.clientHeight >= target || tries > 30) {
        node.scrollTop = target;
        return;
      }
      tries += 1;
      raf = requestAnimationFrame(positionInit);
    };
    positionInit();

    // Arrastar com o mouse pra cima/baixo como se fosse toque. O scroll do mouse
    // pula de 2 em 2; o arraste dá controle fino de 1 em 1.
    node.style.cursor = 'grab';
    node.style.userSelect = 'none';
    let dragging = false;
    let startY = 0;
    let startTop = 0;

    const onDown = (e: any) => {
      dragging = true;
      startY = e.clientY;
      startTop = node.scrollTop;
      node.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMove = (e: any) => {
      if (!dragging) return;
      node.scrollTop = startTop - (e.clientY - startY);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      node.style.cursor = 'grab';
      snapToRef.current(node.scrollTop);
    };

    node.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      onContentSizeChange={onContentSizeChange}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      // Sem isto o ScrollView da tela engole o arraste vertical no Android e a
      // roda não gira — a página inteira é que rola.
      nestedScrollEnabled
      contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * CENTER_OFFSET }}
    >
      {values.map((v, i) => {
        const distance = Math.abs(i - active);
        return (
          <View key={v} style={styles.item}>
            <Text
              style={[
                styles.itemText,
                distance === 0 && styles.itemTextActive,
                distance === 1 && styles.itemTextNear,
                distance >= 2 && styles.itemTextFar,
              ]}
            >
              {v}
              {suffix ?? ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

interface WheelTimePickerProps {
  hours: number[];
  minutes: string[];
  hour: number;
  minute: string;
  onChange: (hour: number, minute: string) => void;
  /**
   * Avisa a tela para desligar o scroll dela enquanto o dedo está na roda.
   *
   * `nestedScrollEnabled` sozinho não resolve: em ScrollView vertical dentro de
   * ScrollView vertical o pai continua ganhando o gesto em boa parte dos casos,
   * e o usuário arrasta a roda mas a página é que rola. Travar o pai durante o
   * toque é o que garante o comportamento em iOS e Android.
   */
  onScrollLock?: (locked: boolean) => void;
}

export default function WheelTimePicker({
  hours,
  minutes,
  hour,
  minute,
  onChange,
  onScrollLock,
}: WheelTimePickerProps) {
  const hourIndex = Math.max(0, hours.indexOf(hour));
  const minuteIndex = Math.max(0, minutes.indexOf(minute));

  return (
    <View
      style={styles.wrapper}
      onTouchStart={() => onScrollLock?.(true)}
      onTouchEnd={() => onScrollLock?.(false)}
      onTouchCancel={() => onScrollLock?.(false)}
    >
      {/* Faixa central de seleção */}
      <View style={styles.selectionBand} pointerEvents="none" />

      <View style={styles.columns}>
        <WheelColumn
          values={hours.map((h) => String(h).padStart(2, '0'))}
          selectedIndex={hourIndex}
          onChange={(i) => onChange(hours[i], minute)}
          suffix="h"
        />
        <Text style={styles.separator}>:</Text>
        <WheelColumn
          values={minutes}
          selectedIndex={minuteIndex}
          onChange={(i) => onChange(hour, minutes[i])}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: CONTAINER_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: ITEM_HEIGHT * CENTER_OFFSET,
    height: ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  column: {
    height: CONTAINER_HEIGHT,
    width: 84,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
  },
  itemTextActive: { color: '#059669', fontWeight: '800', fontSize: 24 },
  itemTextNear: { color: '#6b7280', opacity: 0.9 },
  itemTextFar: { color: '#9ca3af', opacity: 0.5 },
  separator: {
    fontSize: 24,
    fontWeight: '800',
    color: '#9ca3af',
    marginTop: -2,
  },
});
