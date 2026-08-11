/**
 * Abrir conversa no WhatsApp a partir de um link wa.me.
 *
 * Não usamos `Linking.canOpenURL` aqui de propósito: no Android 11+ a consulta
 * de quais apps resolvem um link é filtrada por package visibility, e sem um
 * `<queries>` declarado no manifesto ela volta `false` mesmo com o WhatsApp
 * instalado — era isso que fazia o app avisar "WhatsApp não encontrado".
 * `openURL` não passa por esse filtro (o Android nunca filtra `startActivity`)
 * e só lança quando de fato não há app para o link, que é o sinal confiável.
 */
import { Linking } from 'react-native';

export async function openWhatsapp(url: string, onUnavailable: () => void): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    onUnavailable();
  }
}
