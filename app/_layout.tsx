import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/components/Toast';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, appUser, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!firebaseUser) {
      // Não autenticado → login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (!appUser?.firstName) {
      // Autenticado mas sem perfil → onboarding
      if (segments[1] !== 'onboarding') {
        router.replace('/(auth)/onboarding');
      }
    } else {
      // Autenticado com perfil → app
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [firebaseUser, appUser, loading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <ToastProvider>
      <AuthGuard>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="perfil" options={({ route }) => ({ title: (route.params as any)?.userId ? 'Perfil' : 'Meu Perfil', headerBackTitle: 'Voltar', headerTintColor: '#10b981', headerTitleStyle: { color: '#111827', fontWeight: '700' } })} />
          <Stack.Screen name="notificacoes" options={{ title: 'Notificações', headerBackTitle: 'Voltar', headerTintColor: '#10b981', headerTitleStyle: { color: '#111827', fontWeight: '700' } }} />
          <Stack.Screen name="nova-reserva" options={{ title: 'Nova reserva', headerBackTitle: 'Voltar', headerTintColor: '#10b981', headerTitleStyle: { color: '#111827', fontWeight: '700' } }} />
          <Stack.Screen name="gerenciar-quadra" options={{ title: 'Gerenciar quadra', headerBackTitle: 'Voltar', headerTintColor: '#10b981', headerTitleStyle: { color: '#111827', fontWeight: '700' } }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </AuthGuard>
      </ToastProvider>
    </AuthProvider>
  );
}
