import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FriendlyError } from '@/lib/errors';

interface ErrorStateProps {
  error: FriendlyError;
  onRetry?: () => void;
  fullPage?: boolean;
}

export default function ErrorState({ error, onRetry, fullPage = false }: ErrorStateProps) {
  return (
    <View style={[styles.wrapper, fullPage && styles.wrapperFullPage]}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="warning" size={28} color="#ef4444" />
        </View>

        <Text style={styles.title}>{error.title}</Text>
        <Text style={styles.message}>{error.message}</Text>

        {onRetry && (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.7}>
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        )}

        {error.rawCode && (
          <Text style={styles.code}>Código: {error.rawCode}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  wrapperFullPage: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
    alignSelf: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  code: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 12,
    fontFamily: 'SpaceMono',
  },
});
