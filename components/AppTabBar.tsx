import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_CONFIG = [
  { name: 'index', label: 'Início', icon: 'home-outline' as const, iconActive: 'home' as const },
  { name: 'reservar', label: 'Reservar', icon: 'calendar-outline' as const, iconActive: 'calendar' as const, featured: true },
  { name: 'social', label: 'Social', icon: 'people-outline' as const, iconActive: 'people' as const },
];

export default function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={styles.inner}>
        {TAB_CONFIG.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const isFocused = state.routes[state.index].name === tab.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (tab.featured) {
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={onPress}
                style={styles.featuredWrapper}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
              >
                <View style={[styles.featuredBtn, isFocused && styles.featuredBtnActive]}>
                  <Ionicons name={isFocused ? tab.iconActive : tab.icon} size={26} color="#ffffff" />
                </View>
                <Text style={[styles.featuredLabel, isFocused && styles.labelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.name}
              onPress={onPress}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <Ionicons
                name={isFocused ? tab.iconActive : tab.icon}
                size={22}
                color={isFocused ? '#10b981' : '#9ca3af'}
              />
              <Text style={[styles.label, isFocused && styles.labelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 64,
    paddingHorizontal: 24,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    gap: 3,
  },
  featuredWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
    gap: 3,
    // lifts the button above the bar
    marginBottom: 8,
  },
  featuredBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: -8,
  },
  featuredBtnActive: {
    backgroundColor: '#059669',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
  },
  labelActive: {
    color: '#10b981',
  },
  featuredLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: 12,
  },
});
