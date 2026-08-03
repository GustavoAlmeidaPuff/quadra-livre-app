/**
 * Notificações do app.
 *
 * Cada notificação vira um documento em `notifications` — que é a coleção que o
 * sininho (components/AppHeader.tsx) e a tela app/notificacoes.tsx já leem, e
 * que o app web também lê. Em cima disso mandamos push pelo Expo para quem tem
 * token registrado. O documento é a fonte da verdade; o push é entrega.
 */
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NotificationType } from '@/types';
import { sendPushNotifications, PushMessage } from '@/lib/push';

/** Preferência que silencia cada tipo. Tipos ausentes aqui sempre notificam. */
const PREF_BY_TYPE: Partial<Record<NotificationType, string>> = {
  quem_anima_novo: 'notifyQuemAnima',
  quem_anima_comentario: 'notifyComments',
  challenge: 'notifyChallenges',
};

export interface NotifyInput {
  toUserIds: string[];
  type: NotificationType;
  /** Texto mostrado na lista de notificações e no corpo do push. */
  message: string;
  /** Título do push. Cai no nome do app se omitido. */
  title?: string;
  fromUserId?: string;
  quemAnimaPostId?: string;
}

interface Recipient {
  id: string;
  expoPushToken?: string | null;
  [key: string]: unknown;
}

/** Preferências são opt-out: quem nunca abriu as configurações recebe tudo. */
function wantsNotification(user: Recipient, type: NotificationType): boolean {
  const prefKey = PREF_BY_TYPE[type];
  if (!prefKey) return true;
  return user[prefKey] !== false;
}

/**
 * Grava as notificações e dispara o push. Nunca lança — notificar é efeito
 * colateral, e falhar aqui não pode desfazer o post/comentário que a gerou.
 */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const { toUserIds, type, message, title, fromUserId, quemAnimaPostId } = input;
  const targets = [...new Set(toUserIds.filter(Boolean))];
  if (targets.length === 0) return;

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const byId = new Map<string, Recipient>();
    usersSnap.docs.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as Recipient));

    const recipients = targets
      .map((id) => byId.get(id))
      .filter((u): u is Recipient => !!u && wantsNotification(u, type));

    if (recipients.length === 0) return;

    // Firestore aceita no máximo 500 operações por batch.
    for (let i = 0; i < recipients.length; i += 400) {
      const batch = writeBatch(db);
      recipients.slice(i, i + 400).forEach((u) => {
        batch.set(doc(collection(db, 'notifications')), {
          toUserId: u.id,
          type,
          message,
          read: false,
          createdAt: Timestamp.now(),
          ...(fromUserId ? { fromUserId } : {}),
          ...(quemAnimaPostId ? { quemAnimaPostId } : {}),
        });
      });
      await batch.commit();
    }

    const pushes: PushMessage[] = recipients
      .filter((u) => typeof u.expoPushToken === 'string' && u.expoPushToken)
      .map((u) => ({
        to: u.expoPushToken as string,
        title: title ?? 'QuadraLivre',
        body: message,
        data: quemAnimaPostId ? { type, quemAnimaPostId } : { type },
      }));

    await sendPushNotifications(pushes);
  } catch (e) {
    console.warn('[notifications] falha ao notificar:', e);
  }
}

/**
 * IDs de todo mundo que pode receber o aviso de post novo do "Quem anima?":
 * usuários não-anônimos, das mesmas quadras, exceto o próprio autor.
 * O filtro de preferência acontece depois, em notifyUsers.
 */
export async function getBroadcastAudience(
  authorId: string,
  courtId: string
): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .filter((d) => {
      if (d.id === authorId) return false;
      const u = d.data();
      if (u.isAnonymous === true) return false;
      // courtIds vazio/ausente = jogador vê todas as quadras.
      const courts: string[] = u.courtIds ?? [];
      return courts.length === 0 || courts.includes(courtId);
    })
    .map((d) => d.id);
}
