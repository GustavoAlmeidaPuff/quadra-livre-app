import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Post, User } from '@/types';

interface PostWithAuthor extends Post {
  authorName: string;
  authorPicture?: string;
  authorInitials: string;
}

function getInitials(name: string) {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0][0] ?? '?').toUpperCase();
}

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

async function loadPosts(): Promise<PostWithAuthor[]> {
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(30));
  const snap = await getDocs(q);

  const authorIds = [...new Set(snap.docs.map((d) => d.data().authorId as string))];
  const authorDocs = await Promise.all(
    authorIds.map((id) => getDoc(doc(db, 'users', id)))
  );
  const authorsMap: Record<string, User> = {};
  authorDocs.forEach((d) => {
    if (d.exists()) authorsMap[d.id] = { id: d.id, ...d.data() } as User;
  });

  return snap.docs.map((d) => {
    const data = d.data() as Post;
    const author = authorsMap[data.authorId];
    const name = author ? `${author.firstName} ${author.lastName ?? ''}`.trim() : 'Usuário';
    return {
      id: d.id,
      ...data,
      authorName: name,
      authorPicture: author?.pictureUrl,
      authorInitials: getInitials(name),
    };
  });
}

export default function SocialScreen() {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await loadPosts();
      setPosts(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>Nenhuma postagem ainda.</Text>
        </View>
      ) : (
        posts.map((post) => (
          <View key={post.id} style={styles.card}>
            {/* Author */}
            <View style={styles.author}>
              {post.authorPicture ? (
                <Image source={{ uri: post.authorPicture }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{post.authorInitials}</Text>
                </View>
              )}
              <View>
                <Text style={styles.authorName}>{post.authorName}</Text>
                <Text style={styles.postTime}>
                  {timeAgo(post.createdAt.toDate())}
                </Text>
              </View>
            </View>

            {/* Content */}
            <Text style={styles.content}>{post.content}</Text>

            {/* Image */}
            {post.imageUrl && (
              <Image
                source={{ uri: post.imageUrl }}
                style={styles.postImage}
                resizeMode="cover"
              />
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  authorName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  postTime: { fontSize: 12, color: '#9ca3af' },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
});
