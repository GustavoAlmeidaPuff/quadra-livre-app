/**
 * Push notifications via Expo.
 *
 * O app nativo não tem backend próprio (ver lib/reservations.ts), então o
 * fan-out é feito pelo próprio cliente chamando a Expo Push API, que é um
 * endpoint público. Para ~150 jogadores conhecidos de um clube isso é
 * suficiente; a contrapartida é que qualquer usuário autenticado consegue ler
 * os tokens e disparar push. Se um dia isso incomodar, o caminho é mover o
 * envio para uma rota de servidor no repo web (firebase-admin já está lá).
 *
 * Push só funciona em development build / build de produção — o Expo Go não
 * entrega push remoto desde o SDK 53.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Mostra o alerta mesmo com o app aberto. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId
  );
}

/**
 * Pede permissão, obtém o token do aparelho e grava no doc do usuário.
 * Silencioso em qualquer falha: push é um extra, não pode quebrar o login.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Padrão',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10b981',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) return null;

    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
    return token;
  } catch (e) {
    console.warn('[push] não foi possível registrar o token:', e);
    return null;
  }
}

/**
 * Envia as mensagens em lotes de 100 (limite da Expo Push API).
 * Nunca lança: uma falha de push não deve desfazer a ação que a originou.
 */
export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to?.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          chunk.map((m) => ({
            to: m.to,
            title: m.title,
            body: m.body,
            data: m.data ?? {},
            sound: 'default',
            channelId: 'default',
          }))
        ),
      });
      if (!res.ok) {
        console.warn('[push] Expo respondeu', res.status, await res.text());
      }
    } catch (e) {
      console.warn('[push] falha ao enviar lote:', e);
    }
  }
}
