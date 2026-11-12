'use client';

import { useInventories } from '@/lib/queries/inventory';
import { useLease } from '@/lib/queries/leases';
import { usePaymentsHistory } from '@/lib/queries/payments';
import type { PaymentHistoryRow } from '@/types/invoice';
import type { OccupationDuBien, PropertyDetail } from '@/types/property';

/**
 * TCK-2639 — ce que l'onglet « Location », la carte « Occupation » (bureau) et la barre du bas
 * (téléphone) lisent d'un bien. Les trois appellent ce hook : TanStack Query ne fait partir chaque
 * requête qu'une fois, si bien qu'ils ne peuvent pas dire deux choses.
 *
 * Rien du métier n'est recalculé : l'occupant, le bail, l'état du mois et la vacance sont le bloc
 * `occupancy` de l'API (TCK-2637). Les lectures d'appoint ne partent que sur un bail lisible :
 *  · le bail (`GET /api/leases/{id}`) — ses `abilities` (« Encaisser » : `record_payment`), la caution,
 *    le préavis ;
 *  · ses échéances (`GET /api/payments/history`, filtrées sur le bail) — l'échéance du mois, dont
 *    l'identifiant sert « Encaisser » et « Relancer », et les quatre dernières (le tableau du bureau) ;
 *  · son état des lieux d'entrée (`GET /api/inventories?filter[lease_id]=`).
 */

/** Les quatre dernières échéances du tableau « Loyers » ; la ligne du mois est parmi elles. */
export const ECHEANCES_LUES = 6;

export interface LocationDuBien {
  readonly occupation: OccupationDuBien | null;
  /** Le bien est occupé (ou en préavis) : un bail court. */
  readonly occupe: boolean;
  /** Le bail se lit : l'API rend son identifiant (TCK-2637, sinon les clés du bail sont absentes). */
  readonly bailId: number | null;
  readonly bail: ReturnType<typeof useLease>;
  readonly echeances: ReturnType<typeof usePaymentsHistory>;
  readonly etatDesLieux: ReturnType<typeof useInventories>;
  /** L'échéance du mois, lue dans l'historique du bail ; `null` tant qu'elle n'est pas trouvée. */
  readonly ligneDuMois: PaymentHistoryRow | null;
  /** L'échéance de la période précédente, si elle est réglée (« octobre payé le 29 oct. ») ; `null` sinon. */
  readonly precedentRegle: PaymentHistoryRow | null;
  /** « Encaisser » et « Relancer » : le personnel, sur un bail dont l'API accorde l'encaissement. */
  readonly peutEncaisser: boolean;
  /** Le mois reste à régler : « Encaisser » a un objet. */
  readonly resteDu: boolean;
  /**
   * « Encaisser » / « Relancer » se décident encore (bail et échéancier en lecture) pour le personnel
   * sur un mois dû : leur place est tenue, rien ne bouge quand ils arrivent (CLS, AC5).
   */
  readonly gestesEnLecture: boolean;
  /** Le prochain loyer : l'échéance du mois décalée d'une période, si le bail court encore. */
  readonly prochainLoyer: string | null;
}

const MOIS_PAR_PERIODE = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/** `YYYY-MM-DD` + `mois` mois, au calendrier (le 31 janvier + 1 mois → le 28 ou 29 février). */
export function decalerDeMois(date: string, mois: number): string {
  const annee = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + mois;
  const jour = Number(date.slice(8, 10));
  const cible = new Date(Date.UTC(annee, m, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(jour, dernier));
  return cible.toISOString().slice(0, 10);
}

export function prochainLoyerDe(occupation: OccupationDuBien | null): string | null {
  const echeance = occupation?.current_month?.due_date ?? null;
  if (!echeance) return null;
  const pas = MOIS_PAR_PERIODE[occupation?.rent?.payment_frequency ?? 'monthly'] ?? 1;
  const suivant = decalerDeMois(echeance, pas);
  const fin = occupation?.lease?.end_date ?? null;
  return fin !== null && suivant > fin ? null : suivant;
}

export function useLocationDuBien(property: PropertyDetail, personnel: boolean): LocationDuBien {
  const occupation = property.occupancy ?? null;
  const occupe = occupation?.state === 'occupied' || occupation?.state === 'notice';
  const bailId = occupe ? (occupation?.lease?.id ?? null) : null;

  const bail = useLease(bailId);
  const echeances = usePaymentsHistory({
    entity_type: 'lease',
    entity_id: bailId ?? undefined,
    per_page: ECHEANCES_LUES,
    sort: '-date',
    // `payer` : le prénom, le numéro et la langue du locataire, pour la relance (TCK-2660).
    include: ['payer', 'reminders'],
    enabled: bailId !== null,
  });
  const etatDesLieux = useInventoriesDuBail(bailId);

  const dueDuMois = occupation?.current_month?.due_date ?? null;
  const lignes = echeances.data?.data ?? [];
  const ligneDuMois =
    (dueDuMois !== null ? lignes.find((l) => l.source === 'lease' && l.due_date === dueDuMois) : undefined) ?? null;
  const duePrecedente = dueDuMois !== null ? decalerDeMois(dueDuMois, -(MOIS_PAR_PERIODE[occupation?.rent?.payment_frequency ?? 'monthly'] ?? 1)) : null;
  const precedente = duePrecedente !== null ? lignes.find((l) => l.source === 'lease' && l.due_date === duePrecedente) : undefined;
  const precedentRegle = precedente && precedente.status === 'paid' && precedente.paid_at ? precedente : null;
  const statut = occupation?.current_month?.status ?? 'none';
  const resteDu = statut === 'late' || statut === 'partial' || statut === 'due';

  return {
    occupation,
    occupe,
    bailId,
    bail,
    echeances,
    etatDesLieux,
    ligneDuMois,
    precedentRegle,
    peutEncaisser: personnel && bail.data?.data.abilities?.record_payment === true,
    resteDu,
    gestesEnLecture: personnel && resteDu && bailId !== null && (bail.isPending || echeances.isPending),
    prochainLoyer: occupe ? prochainLoyerDe(occupation) : null,
  };
}

function useInventoriesDuBail(bailId: number | null) {
  // `lease_id` à 0 ne filtre rien : la lecture ne part qu'avec un bail (`enabled` par l'identifiant).
  return useInventories(bailId !== null ? { lease_id: bailId, type: 'move_in', per_page: 1, sort: '-conducted_at' } : undefined, bailId !== null);
}
