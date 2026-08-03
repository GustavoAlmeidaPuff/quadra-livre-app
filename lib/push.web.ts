/**
 * Versão web de lib/push.ts — deliberadamente vazia.
 *
 * `expo-notifications` toca em `localStorage` já na inicialização do módulo, e
 * o app web renderiza estático (app.json → web.output: "static"), ou seja roda
 * no Node, onde `localStorage` não existe. Importar o módulo real aqui derruba
 * o servidor inteiro no boot.
 *
 * Push é uma feature de aparelho: no navegador não há token para registrar nem
 * notificação para receber. O Metro resolve este arquivo no lugar de push.ts
 * quando a plataforma é web, então o resto do código importa de '@/lib/push'
 * sem precisar saber de nada disso.
 */

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function registerForPushNotifications(_userId: string): Promise<string | null> {
  return null;
}

/**
 * O envio em si é uma chamada HTTP e funcionaria no navegador, mas quem publica
 * pela web não deve disparar push — os documentos em `notifications` já dão o
 * aviso dentro do app. Ver lib/notifications.ts.
 */
export async function sendPushNotifications(_messages: PushMessage[]): Promise<void> {
  // no-op
}
