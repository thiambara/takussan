import type { QueryClient } from '@tanstack/react-query';
import type { Conversation, Message } from '@/types/message';

/**
 * TCK-2977 (ADR-0131 § 3, TCK-2974) — la fenêtre « N nouveaux messages » d'une OUVERTURE de fil : le compte
 * des non-lus et le premier non-lu, relevés AVANT que `useMarkConversationRead` marque le fil lu. C'est elle
 * qui décide du résumé (10 au moins) et que porte `depuis_message_id`.
 */
export type FenetreDesNonLus = {
  readonly nonLus: number;
  readonly premierNonLuId: number | null;
};

/**
 * Compte-t-il comme non lu pour `moi` ? La règle de `NonLus::comptentPour` (API) : un message d'un autre, hors
 * avis `system` et hors `event` — sauf l'`event` qui attend un geste de ce lecteur.
 */
export function comptePourLesNonLus(m: Message, moi: number | null | undefined): boolean {
  if (moi != null && m.sender_id === moi) return false;
  if (m.type === 'system') return false;
  if (m.type === 'event') return m.action_attendue === true;
  return true;
}

/**
 * Le `unread_count` du fil dans la liste en cache (`['conversations', 'list', …]`), lu tel que l'API l'a rendu
 * avant la marque de lecture. `null` si la liste n'a pas ce fil (lien direct, widget).
 */
export function nonLusDeLaListe(queryClient: QueryClient | undefined, conversationId: number): number | null {
  if (!queryClient) return null;
  // La liste la plus FRAÎCHE d'abord : une liste filtrée inactive peut garder un compte périmé.
  const listes = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['conversations', 'list'] })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const liste of listes) {
    const pages = (liste.state.data as { pages?: { data?: Conversation[] }[] } | undefined)?.pages ?? [];
    for (const page of pages) {
      const fil = page.data?.find((c) => c.id === conversationId);
      if (fil && typeof fil.unread_count === 'number') return fil.unread_count;
    }
  }
  return null;
}

/**
 * La fenêtre depuis les messages chargés (ordre croissant) : le compte de la liste quand on l'a, sinon celui
 * que dit `last_read_at` du lecteur ; ni l'un ni l'autre : AUCUNE fenêtre (fermé par défaut). Le premier non-lu est le N-ième message compté en partant du plus récent ;
 * si la page chargée en a moins, le plus ancien compté chargé (l'API rejuge la fenêtre).
 */
export function fenetreDesNonLus(
  messages: readonly Message[],
  moi: number | null | undefined,
  nonLusConnus: number | null,
  /** `null` : jamais lu (tout compte) ; `undefined` : inconnu (participant non chargé) — pas de fenêtre. */
  dernierLu: string | null | undefined,
): FenetreDesNonLus {
  // Le compte inconnu FERME la fenêtre : un fil déjà lu ne doit jamais passer pour chargé et déclencher un appel.
  if (nonLusConnus === null && dernierLu === undefined) return { nonLus: 0, premierNonLuId: null };
  const comptes = [...messages].sort((a, b) => a.id - b.id).filter((m) => comptePourLesNonLus(m, moi));
  const nonLus =
    nonLusConnus ??
    (dernierLu ? comptes.filter((m) => Date.parse(m.created_at) > Date.parse(dernierLu)).length : comptes.length);
  if (nonLus <= 0 || comptes.length === 0) return { nonLus: Math.max(0, nonLus), premierNonLuId: null };
  const premier = comptes[Math.max(0, comptes.length - nonLus)]!;
  return { nonLus, premierNonLuId: premier.id };
}
