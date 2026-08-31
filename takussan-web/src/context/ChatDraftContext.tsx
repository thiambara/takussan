'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import type { PropertyConversationResolution } from '@/types/message';

/**
 * TCK-500 — le canal entre la fiche d'un bien et la messagerie.
 *
 * Le widget de discussion est monté au layout RACINE (`src/app/layout.tsx`), la fiche du bien est
 * dans `{children}` : ce sont deux frères, ils n'ont aucun autre moyen de se parler. D'où ce
 * contexte, qui les enveloppe tous les deux — même patron que `FloatingDockProvider`, pour la
 * même raison.
 *
 * ⚠️ **Le texte du message ne transite JAMAIS par ce canal vers une URL.** Au-dessus du point de
 * rupture `md`, la cible reste en mémoire et le widget la lit. En dessous, on navigue vers
 * `/app/messages?property=<slug>` — le SLUG seul — et le brouillon est reconstruit à l'arrivée,
 * dans la locale de la page. Un `?draft=<texte>` aurait été plus simple et aurait laissé
 * n'importe qui forger un lien qui pré-écrit une phrase dans le composeur d'un tiers, à envoyer
 * en son nom d'un seul clic.
 */

/**
 * La cible transportée est la RÉSOLUTION DÉJÀ FAITE, pas un simple slug.
 *
 * La fiche du bien interroge `usePropertyConversation` de toute façon — elle en a besoin pour
 * savoir si le bouton « Envoyer un message » a un sens (AC8). Repasser sa réponse au widget
 * plutôt qu'un identifiant à re-résoudre évite un second aller-retour et, surtout, un panneau
 * qui s'ouvre sur un écran de chargement là où l'utilisateur attend une discussion.
 */
export type CibleChatBien = PropertyConversationResolution;

type ChatDraftContextValue = {
  /**
   * La cible posée par la fiche du bien, en attente d'être consommée par le widget.
   * `null` le reste du temps.
   */
  readonly cible: CibleChatBien | null;
  /** Ouvre la discussion sur ce bien — panneau flottant, ou messagerie pleine page sur mobile. */
  readonly ouvrirChatBien: (resolution: CibleChatBien) => void;
  /** Le widget l'appelle quand il a fini d'ouvrir la cible : elle ne doit pas se rejouer. */
  readonly consommerCible: () => void;
};

const ChatDraftContext = createContext<ChatDraftContextValue | null>(null);

/** Point de rupture `md` de Tailwind — le même que `ChatWidget`, qui bascule dessus. */
const MD_BREAKPOINT_PX = 768;

export function ChatDraftProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isMobile = useMatchesMaxWidth(MD_BREAKPOINT_PX - 1);
  const [cible, setCible] = useState<CibleChatBien | null>(null);

  const ouvrirChatBien = useCallback(
    (resolution: CibleChatBien) => {
      if (isMobile) {
        // Le panneau de 360 × 520 ne tient pas sur un téléphone — c'est déjà pourquoi le
        // lanceur mobile du widget navigue au lieu d'ouvrir. On fait pareil, en emportant
        // le bien : `?property=` et RIEN d'autre. La messagerie re-résout à l'arrivée et
        // reconstruit le brouillon dans SA locale.
        router.push(`/app/messages?property=${encodeURIComponent(resolution.property.slug)}`);
        return;
      }
      setCible(resolution);
    },
    [isMobile, router],
  );

  const consommerCible = useCallback(() => setCible(null), []);

  const value = useMemo(
    () => ({ cible, ouvrirChatBien, consommerCible }),
    [cible, ouvrirChatBien, consommerCible],
  );

  return <ChatDraftContext.Provider value={value}>{children}</ChatDraftContext.Provider>;
}

/**
 * Rend `null` hors du provider plutôt que de lever.
 *
 * Ce n'est pas de la complaisance : la fiche d'un bien est rendue dans des tests et des récits
 * qui ne montent pas le layout racine, et une exception y transformerait un composant absent en
 * page blanche. L'appelant traite `null` comme « pas de messagerie ici » et retombe sur le
 * dialogue.
 */
export function useChatDraft(): ChatDraftContextValue | null {
  return useContext(ChatDraftContext);
}
