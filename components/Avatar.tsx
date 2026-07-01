import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface AvatarProps {
  uri?: string | null;
  initials: string;
  size: number;
  fontSize?: number;
  fontWeight?: '700' | '800';
}

export default function Avatar({ uri, initials, size, fontSize = 13, fontWeight = '700' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  // A previously-broken uri may become valid again (e.g. after the user re-uploads
  // a photo), so don't let a stale failure stick once the uri itself changes.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={dimensionStyle}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[dimensionStyle, styles.fallback]}>
      <Text style={[styles.text, { fontSize, fontWeight }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#ffffff' },
});
