'use client';

import { useRef, type MouseEvent } from 'react';

import { useConsignerGesteDuClient } from '@/lib/queries/conversations';

type Canal = 'call' | 'whatsapp';

/**
 * TCK-2632 (réserve de la contre-vérification) — un geste de contact du fil (appeler, WhatsApp) ne part
 * qu'UNE fois tant qu'il est en cours. Depuis ab775a40f, la feuille du fil reste ouverte le temps que le
 * geste soit noté : un second appui notait un second contact (l'API ne déduplique pas) et ouvrait un
 * second onglet wa.me. L'en-tête du fil avait le même défaut.
 *
 * Le second appui est donc IGNORÉ — `preventDefault()` : ni lien suivi, ni contact noté — tant que le
 * geste de ce canal n'est pas rendu (réussi ou refusé), et le lien se dit `aria-disabled` pendant ce
 * temps. Le verrou est une ref, posée au clic : un double toucher arrive avant que `isPending` ne soit
 * rendu (TanStack notifie au tour suivant).
 */
export function useGesteDuClient() {
  const geste = useConsignerGesteDuClient();
  const enVol = useRef(new Set<Canal>());
  const enCours = geste.isPending === true;

  /**
   * À appeler dans le `onClick` du lien : `false` (et le clic annulé) quand le geste est déjà en cours.
   * `onDepart` court juste avant l'envoi, jamais pour un appui ignoré.
   */
  const consigner = (
    event: MouseEvent<HTMLElement> | null,
    vars: { readonly id: number; readonly channel: Canal },
    options: { readonly onDepart?: () => void; readonly onSuccess?: () => void; readonly onError?: () => void } = {},
  ): boolean => {
    if (enCours || enVol.current.has(vars.channel)) {
      event?.preventDefault();
      return false;
    }
    enVol.current.add(vars.channel);
    options.onDepart?.();
    const liberer = () => enVol.current.delete(vars.channel);
    geste.mutate(
      { id: vars.id, channel: vars.channel },
      {
        onSuccess: () => {
          liberer();
          options.onSuccess?.();
        },
        onError: () => {
          liberer();
          options.onError?.();
        },
        onSettled: liberer,
      },
    );
    return true;
  };

  return { consigner, enCours };
}
