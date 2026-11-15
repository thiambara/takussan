'use client';

import { useIntentionDeReservation } from '@/app/[locale]/(public)/properties/[slug]/components/useIntentionDeReservation';
import type { IntentionReservation } from '@/lib/property/intention-reservation';
import type { ContractType, RentPeriod } from '@/types/property';
import { useOuvrirReservation } from './useOuvrirReservation';

/**
 * TCK-2510 — UN parcours de réservation par bien, pour les deux entrées de la fiche :
 *
 *   · « Réserver » (`ouvrir`) ;
 *   · le retour de connexion `?action=reserver&debut=&fin=` (TCK-589), lu quand la session l'est.
 *
 * Un séjour court va au tunnel `/bookings` — dates reprises pour le retour ; le dossier d'une
 * location au mois et l'offre d'achat gardent la boîte de la fiche, qui reçoit `intention`.
 */
export function useReservationDeLaFiche(
  bien: { readonly slug: string; readonly contract_type: ContractType | null; readonly rent_period?: RentPeriod | null },
  sessionLue: boolean,
  ouvrirLaBoite: () => void,
): { readonly ouvrir: () => void; readonly intention: IntentionReservation | null } {
  const ouvrirAvec = useOuvrirReservation(bien, ouvrirLaBoite);
  const intention = useIntentionDeReservation(sessionLue, (lue) => ouvrirAvec({ debut: lue.debut, fin: lue.fin }));
  return { ouvrir: () => ouvrirAvec(), intention };
}
