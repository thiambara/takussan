import type { ChatRenderItem } from '@/lib/messages/groupByDay';
import type { Message } from '@/types/message';

/**
 * TCK-2962 (ADR-0128, maquette `fil-cartes` D) — la nature d'affichage d'un message du fil :
 *
 * · `carte` : une `card`, ou un `event` qui attend un geste de CE lecteur (`action_attendue`, TCK-2959) —
 *   il reste visible, en carte, avec ses gestes ;
 * · `evenement` : tout autre `event` — une ligne, repliable avec ses voisins ;
 * · `message` : le reste (texte, pièce, note vocale, avis système), inchangé.
 */
export function natureDuMessage(message: Message): 'carte' | 'evenement' | 'message' {
  if (message.type === 'card') return 'carte';
  if (message.type === 'event') return message.action_attendue === true ? 'carte' : 'evenement';
  return 'message';
}

/** À partir de combien d'événements consécutifs la suite se replie en une ligne. */
export const SEUIL_DE_REPLI = 2;

export type ElementDuFil =
  | ChatRenderItem
  | { readonly kind: 'evenements'; readonly key: string; readonly messages: readonly Message[] };

/**
 * Replie en UNE ligne chaque suite d'au moins {@link SEUIL_DE_REPLI} `event` consécutifs sans geste attendu
 * (« 3 événements · … ») ; un séparateur de jour, un message, une carte ou un événement qui attend le
 * lecteur coupe la suite. Un événement seul reste une ligne. Fonction pure : l'ordre est conservé.
 */
export function replierLesEvenements(items: readonly ChatRenderItem[]): ElementDuFil[] {
  const sortie: ElementDuFil[] = [];
  let suite: Message[] = [];

  const clore = () => {
    if (suite.length >= SEUIL_DE_REPLI) {
      sortie.push({ kind: 'evenements', key: `evenements-${suite[0]!.id}`, messages: suite });
    } else {
      for (const message of suite) sortie.push({ kind: 'message', message });
    }
    suite = [];
  };

  for (const item of items) {
    if (item.kind === 'message' && natureDuMessage(item.message) === 'evenement') {
      suite.push(item.message);
      continue;
    }
    clore();
    sortie.push(item);
  }
  clore();

  return sortie;
}
