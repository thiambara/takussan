import { useEffect, useState } from 'react';

import {
  lireIntentionReservation,
  sansIntentionReservation,
  type IntentionReservation,
} from '@/lib/property/intention-reservation';

/**
 * TCK-589 — rouvre la boîte quand la fiche est atteinte par `?action=reserver` (retour de connexion
 * ou d'inscription), et rend les dates rapportées. `pret` attend la fin du chargement de la
 * session : ouverte trop tôt, la boîte afficherait « Connectez-vous » au compte qui vient de le
 * faire. L'intention est retirée de l'URL une fois lue — un rechargement ne rouvre rien.
 *
 * TCK-850 (P33.04) — hors du module du dialogue : la fiche l'appelle au montage, et l'importer de
 * là y tirait tout le dialogue, `DatePicker` compris, avant le premier clic.
 */
export function useIntentionDeReservation(
  pret: boolean,
  ouvrir: () => void,
): IntentionReservation | null {
  const [intention, setIntention] = useState<IntentionReservation | null>(null);

  useEffect(() => {
    if (!pret) return;
    const lue = lireIntentionReservation(window.location.search);
    if (!lue) return;
    window.history.replaceState(window.history.state, '', sansIntentionReservation(window.location.href));
    // L'URL n'existe qu'au client : la lire au rendu ferait diverger l'hydratation. Lecture unique
    // d'un système extérieur, après montage — le cas que la règle laisse passer en esprit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntention(lue);
    ouvrir();
  }, [pret, ouvrir]);

  return intention;
}
