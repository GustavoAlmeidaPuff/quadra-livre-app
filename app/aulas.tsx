import React from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const RAFITOS_WHATSAPP =
  'https://wa.me/555199160036?text=Oi%20Rafitos!%20Quero%20saber%20sobre%20aulas%20de%20tenis.';

function Highlight({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.highlightCard}>
      <Ionicons name={icon} size={38} color="#059669" />
      <Text style={styles.highlightText}>{text}</Text>
    </View>
  );
}

export default function AulasScreen() {
  const openWhatsapp = async () => {
    await Linking.openURL(RAFITOS_WHATSAPP);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Fundo decorativo */}
      <View pointerEvents="none" style={[styles.blob, styles.blobEmerald]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobSky]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobAmber]} />

      {/* Logo */}
      <View style={styles.logoWrap}>
        <View style={styles.logoHalo} />
        <Image
          source={require('../assets/images/parceiros/rafitos.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Logo Rafitos"
        />
      </View>

      <Text style={styles.title}>Aulas de Tenis com Rafitos</Text>
      <Text style={styles.subtitle}>
        Prazer! Sou Rafitos Alcaraz, irmão brasileiro de Carlos Alcaraz.
      </Text>

      {/* Bloco principal */}
      <View style={styles.panel}>
        <View style={styles.highlights}>
          <Highlight icon="school-outline" text="Aulas para iniciantes e intermediários" />
          <Highlight
            icon="locate-outline"
            text="Treinos focados em técnica, tática e confiança em quadra"
          />
          <Highlight icon="flash-outline" text="Ambiente leve, mas com treino de verdade (sem enrolação 😅)" />
        </View>

        <View style={styles.extras}>
          <Text style={styles.extrasTitle}>Além das aulas, também ofereço:</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>🔧 Encordamento de raquetes</Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>🎒🎾 Acessórios e equipamentos para jogar tênis</Text>
          </View>
        </View>

        <View style={styles.ctaCard}>
          <Text style={styles.ctaTitle}>
            Seja pra começar do zero ou melhorar teu nível, é só chamar 👇
          </Text>
          <TouchableOpacity style={styles.ctaButton} onPress={openWhatsapp} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={20} color="#ffffff" />
            <Text style={styles.ctaButtonText}>Me chama e bora pra quadra</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, alignItems: 'center' },

  blob: { position: 'absolute', borderRadius: 999 },
  blobEmerald: { top: -140, alignSelf: 'center', width: 320, height: 320, backgroundColor: 'rgba(209,250,229,0.7)' },
  blobSky: { top: -70, left: -90, width: 240, height: 240, backgroundColor: 'rgba(224,242,254,0.7)' },
  blobAmber: { top: 300, right: -90, width: 240, height: 240, backgroundColor: 'rgba(254,243,199,0.6)' },

  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  logoHalo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  logo: { width: 224, height: 224 },

  title: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 22,
  },

  panel: {
    marginTop: 28,
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 24,
  },
  highlights: { gap: 16 },
  highlightCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 16,
  },
  highlightText: { marginTop: 8, fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 21 },

  extras: { marginTop: 24 },
  extrasTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  bulletDot: { color: '#6b7280', fontSize: 15, lineHeight: 21 },
  bulletText: { flex: 1, fontSize: 15, color: '#374151', lineHeight: 21 },

  ctaCard: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
    padding: 20,
  },
  ctaTitle: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 22 },
  ctaButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ctaButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
