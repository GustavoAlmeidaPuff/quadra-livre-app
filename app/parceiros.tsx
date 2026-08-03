import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Sponsor = {
  name: string;
  logo: ImageSourcePropType;
  description: string;
};

const sponsors: Sponsor[] = [
  {
    name: 'Sanvitron',
    logo: require('../assets/images/parceiros/sanvitron.png'),
    description:
      'A Sanvitron oferece soluções modernas em automação de estacionamentos, trazendo tecnologia, praticidade e controle para empresas e espaços urbanos.',
  },
  {
    name: 'Auto Sandense',
    logo: require('../assets/images/parceiros/auto-sandense.png'),
    description:
      'A Auto Sandense é especializada em mecânica automotiva, com atendimento de confiança, qualidade e cuidado para manter seu carro sempre em dia.',
  },
  {
    name: 'Climacar',
    logo: require('../assets/images/parceiros/climacar.png'),
    description:
      'A Climacar é referência em climatização automotiva, oferecendo manutenção e instalação de ar-condicionado com eficiência e conforto para o seu dia a dia.',
  },
  {
    name: 'Rafitos Alcaraz',
    logo: require('../assets/images/parceiros/rafitos.png'),
    description:
      'Aulas de tênis com treinos dinâmicos, metodologia prática e uma pegada leve. O foco é claro: evolução dentro de quadra.',
  },
];

export default function ParceirosScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="handshake-outline" size={24} color="#047857" />
          </View>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>Parceiros do Tênis</Text>
            <Text style={styles.subtitle}>
              Empresas e marcas que apoiam o ecossistema do tênis nas quadras parceiras.
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          {sponsors.map((sponsor) => (
            <View key={sponsor.name} style={styles.sponsorCard}>
              <View style={styles.logoBox}>
                <Image
                  source={sponsor.logo}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel={`Logo ${sponsor.name}`}
                />
              </View>
              <View>
                <Text style={styles.sponsorName}>{sponsor.name}</Text>
                <Text style={styles.sponsorDescription}>{sponsor.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, paddingBottom: 40 },

  panel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 24,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  headerIcon: { borderRadius: 16, backgroundColor: '#d1fae5', padding: 12 },
  headerTexts: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#4b5563', marginTop: 2, lineHeight: 18 },

  grid: { gap: 16 },
  sponsorCard: {
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  logoBox: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingHorizontal: 16,
  },
  logo: { width: '100%', height: 64 },

  sponsorName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  sponsorDescription: { fontSize: 13, color: '#4b5563', lineHeight: 20 },
});
