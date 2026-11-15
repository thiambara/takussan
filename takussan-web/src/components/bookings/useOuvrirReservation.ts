'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

import type { Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import type { ContractType, RentPeriod } from '@/types/property';
import { cheminDuTunnel, estSejourCourt, type SejourDemande } from './tunnel-de-reservation';

/**
 * TCK-2510 — ce que fait « Réserver » sur la fiche.
 *
 * Un séjour court (à la nuit, à la semaine) ouvre le tunnel plein écran `/bookings?property=`,
 * qui commence par le calendrier des nuits prises. Tout le reste — le dossier d'une location au
 * mois (« Postuler »), l'offre d'une vente — garde la boîte de la fiche (`ouvrirLaBoite`).
 */
export function useOuvrirReservation(
  bien: { readonly slug: string; readonly contract_type: ContractType | null; readonly rent_period?: RentPeriod | null },
  ouvrirLaBoite: () => void,
): (sejour?: Partial<SejourDemande>) => void {
  const router = useRouter();
  const locale = useLocale() as Locale;
  // `sejour` : les dates d'un retour de connexion (`useReservationDeLaFiche`). Un clic passe par
  // l'enveloppe sans argument de ce hook-là — jamais un événement pris pour des dates.
  return (sejour = {}) => {
    if (estSejourCourt(bien)) router.push(hrefLocalise(cheminDuTunnel(bien.slug, sejour), locale));
    else ouvrirLaBoite();
  };
}
