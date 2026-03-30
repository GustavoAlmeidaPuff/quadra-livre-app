import React from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PhotoViewerProps {
  uri: string | null | undefined;
  visible: boolean;
  onClose: () => void;
}

export default function PhotoViewer({ uri, visible, onClose }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();

  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.95)" barStyle="light-content" />
      <View style={styles.overlay}>
        {/* Fechar ao clicar fora */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Botão fechar */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          hitSlop={16}
        >
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>

        {/* Foto ampliada */}
        <Image
          source={{ uri }}
          style={styles.photo}
          resizeMode="contain"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  photo: {
    width: '100%',
    height: '80%',
  },
});
