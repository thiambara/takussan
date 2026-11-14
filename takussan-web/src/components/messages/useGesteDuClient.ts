'use client';

import { useEffect, useRef, type MouseEvent } from 'react';

import { useConsignerGesteDuClient } from '@/lib/queries/conversations';
import { creerRegistreEnVol } from '@/lib/registre-en-vol';

type Canal = 'call' | 'whatsapp';

/**
 * Les gestes de contact EN VOL, par client et par canal (`31:whatsapp`), au-dessus des composants.
 *
 * Contre-vérification de 05be499f4 (verif-commercial) — le verrou vivait dans chaque composant : au
 * téléphone, l'en-tête du fil (sa feuille « Joindre ») et la feuille du fil en tenaient chacun un, et
 * un fil quitté puis rouvert repartait à zéro. WhatsApp dans la feuille, la feuille fermée pendant
 * l'envoi, puis WhatsApp dans l'en-tête : deux contacts notés et deux onglets wa.me.
 */
const registre = creerRegistreEnVol<string>();
const cleDe = (id: number, canal: Canal) => `${id}:${canal}`;

/**
 * TCK-2632 (réserve de la contre-vérification) — un geste de contact du fil (appeler, WhatsApp) ne part
 * qu'UNE fois tant qu'il est en cours. Depuis ab775a40f, la feuille du fil reste ouverte le temps que le
 * geste soit noté : un second appui notait un second contact (l'API ne déduplique pas) et ouvrait un
 * second onglet wa.me. L'en-tête du fil avait le même défaut.
 *
 * Le second appui est donc IGNORÉ — `preventDefault()` : ni lien suivi, ni contact noté — tant que le
 * geste de ce client et de ce canal n'est pas rendu (réussi ou refusé), d'où qu'il soit parti, et les
 * liens du client se disent `aria-disabled` pendant ce temps. Le verrou se lit au clic, dans le
 * registre : un double toucher arrive avant tout nouveau rendu.
 *
 * Il se libère à l'issue de la PROMESSE (`mutateAsync`), pas d'un rappel de `mutate` : TanStack ne
 * rappelle pas un composant démonté, et le verrou serait resté posé pour de bon. Les rappels de
 * l'appelant (`onSuccess`, `onError`), eux, ne courent que s'il est encore monté : la feuille rouverte
 * ne se referme pas sur l'issue de l'ancienne.
 *
 * @param clientId le client dont les liens sont affichés (`null` : aucun) — pour `enCours`.
 */
export function useGesteDuClient(clientId: number | null = null) {
  const geste = useConsignerGesteDuClient();
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  const enVol = registre.useEnVol(...(clientId === null ? [] : [cleDe(clientId, 'call'), cleDe(clientId, 'whatsapp')]));
  const enCours = geste.isPending === true || enVol;

  /**
   * À appeler dans le `onClick` du lien : `false` (et le clic annulé) quand le geste est déjà en cours.
   * `onDepart` court juste avant l'envoi, jamais pour un appui ignoré.
   */
  const consigner = (
    event: MouseEvent<HTMLElement> | null,
    vars: { readonly id: number; readonly channel: Canal },
    options: { readonly onDepart?: () => void; readonly onSuccess?: () => void; readonly onError?: () => void } = {},
  ): boolean => {
    const cle = cleDe(vars.id, vars.channel);
    if (geste.isPending === true || registre.estEnVol(cle)) {
      event?.preventDefault();
      return false;
    }
    options.onDepart?.();
    registre
      .pendant(cle, () => geste.mutateAsync({ id: vars.id, channel: vars.channel }))
      .then(
        () => {
          if (monte.current) options.onSuccess?.();
        },
        () => {
          if (monte.current) options.onError?.();
        },
      );
    return true;
  };

  return { consigner, enCours };
}
