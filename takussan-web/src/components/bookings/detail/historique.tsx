'use client';

import { useTranslations } from 'next-intl';

import { useVisitesDuClient } from '@/lib/queries/booking-dossier';
import { demandesSurLeBien, visitesEffectueesSurLeBien, type VisiteEffectuee } from '@/lib/reservations/candidature';
import type { Booking } from '@/types/booking';

import { HistoriqueDeLaReservation } from './pieces-du-detail';

/** Un événement de l'historique, avant sa mise en forme. */
export type EvenementDeLHistorique = { readonly quoi: string; readonly at: string; readonly cle: string };

/**
 * TCK-2875 (maquette `app-reservations` a, l. 38-55) — l'historique d'une candidature ou d'une offre
 * mêle aux événements de la réservation les visites EFFECTUÉES du client sur ce bien, lues au fil de
 * sa fiche (TCK-2894) : « Visite effectuée avec Sokhna Sène — « Intéressé, veut revoir la cuisine » ».
 *
 * Le fil n'est lu qu'au personnel de l'agence (lui seul en reçoit les visites). TCK-2878 : il l'est
 * même sans visite sur ce bien — la demande de contact qui précède la candidature y entre aussi.
 */
export function HistoriqueDeLaFiche({
  booking,
  evenements,
  personnel,
  formater,
}: {
  readonly booking: Booking;
  readonly evenements: readonly EvenementDeLHistorique[];
  readonly personnel: boolean;
  readonly formater: (at: string) => string;
}) {
  // TCK-2878 (TCK-2875 AC6) — la demande de contact sur ce bien entre aussi, avec ou sans visite : le
  // fil se lit pour toute candidature ou offre du personnel (une lecture, partagée par la fiche).
  const lireLeFil = personnel && booking.kind !== 'stay' && !!booking.customer_id && !!booking.property_id;
  return lireLeFil ? (
    <HistoriqueAvecLesVisites booking={booking} evenements={evenements} formater={formater} />
  ) : (
    <HistoriqueDeLaReservation lignes={misesEnForme(evenements, formater)} />
  );
}

function HistoriqueAvecLesVisites({
  booking,
  evenements,
  formater,
}: {
  readonly booking: Booking;
  readonly evenements: readonly EvenementDeLHistorique[];
  readonly formater: (at: string) => string;
}) {
  const t = useTranslations('bookings.fiche.historique');
  const tVerdicts = useTranslations('compteRendu.verdicts');
  const fil = useVisitesDuClient(booking.customer_id);
  const visites = fil.data ? visitesEffectueesSurLeBien(fil.data.data, booking.property_id) : [];
  const ligne = (v: VisiteEffectuee): EvenementDeLHistorique => {
    const quoi = t('visite', { agent: v.agent ?? 'aucun' });
    const verdict = v.verdict && ['interested', 'thinking', 'not_interested'].includes(v.verdict) ? tVerdicts(v.verdict as 'interested') : null;
    const texte = [verdict, v.note ? (verdict ? minusculeInitiale(v.note) : v.note) : null].filter(Boolean).join(', ');
    return { cle: v.cle, at: v.at, quoi: texte ? t('citation', { quoi, texte }) : quoi };
  };
  // TCK-2878 (TCK-2875 AC6) — « Demande de contact reçue », bornée au bien par l'API (note `lead_message`).
  const demandes = fil.data ? demandesSurLeBien(fil.data.data, booking.property_id).map((d) => ({ ...d, quoi: t('demande') })) : [];
  return <HistoriqueDeLaReservation lignes={misesEnForme([...evenements, ...visites.map(ligne), ...demandes], formater)} />;
}

/** Du plus récent au plus ancien. */
function misesEnForme(evenements: readonly EvenementDeLHistorique[], formater: (at: string) => string) {
  return [...evenements]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((e) => ({ cle: e.cle, quoi: e.quoi, quand: formater(e.at) }));
}

/** « Veut revoir la cuisine » → « veut revoir la cuisine » après le verdict ; un sigle reste tel quel. */
function minusculeInitiale(texte: string): string {
  if (texte.length > 1 && texte.charAt(1) === texte.charAt(1).toUpperCase() && /\p{L}/u.test(texte.charAt(1))) return texte;
  return texte.charAt(0).toLowerCase() + texte.slice(1);
}
