import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  AuthErrorCodes,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { auth, db } from '@/lib/firebase';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

if (googleWebClientId) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
  });
}

type AuthMode = 'login' | 'signup';

async function ensureUserDoc(uid: string, email: string | null, pictureUrl: string | null) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    await setDoc(doc(db, 'users', uid), {
      ...(email ? { email } : {}),
      ...(pictureUrl ? { pictureUrl } : {}),
      isAnonymous: false,
      isPrivate: false,
      createdAt: serverTimestamp(),
    });
    return false; // needs onboarding
  } else {
    const data = snap.data();
    if (email && (!data?.email || data.email !== email)) {
      await updateDoc(doc(db, 'users', uid), { email });
    }
    return Boolean(data?.firstName); // has profile
  }
}

function getAuthErrorMessage(code: string): string {
  switch (code) {
    case AuthErrorCodes.INVALID_EMAIL:
      return 'Email inválido.';
    case AuthErrorCodes.USER_DISABLED:
      return 'Esta conta foi desativada.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email ou senha incorretos.';
    case AuthErrorCodes.EMAIL_EXISTS:
      return 'Este email já está em uso.';
    case AuthErrorCodes.WEAK_PASSWORD:
      return 'Senha muito fraca. Use pelo menos 6 caracteres.';
    default:
      return 'Ocorreu um erro. Tente novamente.';
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const googleEnabled = !!googleWebClientId;

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type === 'success' && response.data.idToken) {
        await handleGoogleCredential(response.data.idToken);
      }
    } catch (e: unknown) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) {
          return;
        }
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          setError('Google Play Services indisponível neste aparelho.');
          return;
        }
      }
      setError('Não foi possível entrar com Google. Tente novamente.');
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    try {
      setLoading(true);
      setError('');
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      await ensureUserDoc(
        result.user.uid,
        result.user.email ?? null,
        result.user.photoURL ?? null
      );
      // AuthGuard in _layout.tsx handles redirect based on auth state
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      setError(getAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim()) { setError('Digite seu email.'); return; }
    if (!password) { setError('Digite sua senha.'); return; }
    if (mode === 'signup' && password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const trimmed = email.trim();
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, trimmed, password);
        await ensureUserDoc(cred.user.uid, cred.user.email ?? null, null);
      } else {
        const cred = await signInWithEmailAndPassword(auth, trimmed, password);
        await ensureUserDoc(cred.user.uid, cred.user.email ?? null, null);
      }
      // AuthGuard handles redirect
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : '';
      setError(getAuthErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>QuadraLivre</Text>
          <Text style={styles.subtitle}>Reservas e agenda em várias quadras</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Google */}
          {googleEnabled && (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Entrar com Google</Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          {googleEnabled && (
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>
          )}

          {/* Email/Senha */}
          <Text style={styles.sectionLabel}>Email e senha</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            editable={!loading}
          />
          {mode === 'signup' && (
            <Text style={styles.hint}>Mínimo 6 caracteres</Text>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleEmailSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            disabled={loading}
          >
            <Text style={styles.switchModeText}>
              {mode === 'login'
                ? 'Não tem conta? Criar conta'
                : 'Já tem conta? Entrar'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ecfdf5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  input: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: -8,
    marginBottom: 12,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  switchModeText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
});
