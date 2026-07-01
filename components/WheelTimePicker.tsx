import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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

  // Posiciona no valor inicial (sem animação) ao montar.
  const didInit = useRef(false);
  const onLayout = () => {
    if (didInit.current) return;
    didInit.current = true;
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  };

  const indexFromOffset = (y: number) =>
    Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_HEIGHT)));

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    if (idx !== active) setActive(idx);
  };

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = indexFromOffset(e.nativeEvent.contentOffset.y);
    setActive(idx);
    if (idx !== selectedIndex) onChange(idx);
  };

  return (
    <ScrollView
      ref={scrollRef}
      onLayout={onLayout}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
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
}

export default function WheelTimePicker({ hours, minutes, hour, minute, onChange }: WheelTimePickerProps) {
  const hourIndex = Math.max(0, hours.indexOf(hour));
  const minuteIndex = Math.max(0, minutes.indexOf(minute));

  return (
    <View style={styles.wrapper}>
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
