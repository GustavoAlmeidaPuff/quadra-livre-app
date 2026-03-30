import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// Mesmo regex do app web: @[Nome](userId)
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

interface Part {
  type: 'text' | 'mention';
  text: string;
  userId?: string;
}

function parseContent(content: string): Part[] {
  const parts: Part[] = [];
  let lastIndex = 0;
  MENTION_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = MENTION_REGEX.exec(content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, m.index) });
    }
    parts.push({ type: 'mention', text: m[1], userId: m[2] });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', text: content }];
}

interface PostContentProps {
  content: string;
  style?: object;
}

export default function PostContent({ content, style }: PostContentProps) {
  const router = useRouter();
  const parts = parseContent(content);

  return (
    <Text style={[styles.base, style]}>
      {parts.map((part, i) =>
        part.type === 'mention' && part.userId ? (
          <Text
            key={i}
            style={styles.mention}
            onPress={() => router.push(`/perfil?userId=${part.userId}`)}
          >
            @{part.text}
          </Text>
        ) : (
          <Text key={i}>{part.text}</Text>
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  mention: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
