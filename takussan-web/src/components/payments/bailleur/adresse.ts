/**
 * TCK-2651 — ce que la page « Loyers » du bailleur lit dans son adresse, en fonctions pures.
 *
 * - `?period=YYYY-MM` (un mois) ou `?period=YYYY` (l'année, l'attestation annuelle) ; le mois courant
 *   sinon. Une valeur que l'API refuserait (`2026-13`, `octobre`) vaut une valeur absente.
 * - `?tab=` : `versements`, `factures`, `operations` ; « Revenus » sans paramètre. Les liens d'avant
 *   (`?tab=payouts`, `invoices`, `history`, ceux des notifications de `PaymentsTabs`) mènent à
 *   l'onglet qui les remplace : un lien profond ne casse pas (ADR-0100 § 7).
 */
import { estMois } from '@/lib/finances/mois';
import type { OwnerStatement } from '@/types/invoice';

export const ONGLETS_DES_LOYERS = ['revenus', 'versements', 'factures', 'operations'] as const;
export type OngletDesLoyers = (typeof ONGLETS_DES_LOYERS)[number];

const ANCIENS_ONGLETS: Readonly<Record<string, OngletDesLoyers>> = {
  history: 'operations',
  invoices: 'factures',
  payouts: 'versements',
};

interface Parametres {
  get(nom: string): string | null;
}

export function ongletDeLAdresse(parametres: Parametres | null): OngletDesLoyers {
  const valeur = parametres?.get('tab') ?? null;
  if (valeur === null) return 'revenus';
  if ((ONGLETS_DES_LOYERS as readonly string[]).includes(valeur)) return valeur as OngletDesLoyers;
  return ANCIENS_ONGLETS[valeur] ?? 'revenus';
}

/** Une année que l'API accepte (`period=YYYY`). */
export function estAnnee(valeur: string | null | undefined): boolean {
  return typeof valeur === 'string' && /^\d{4}$/.test(valeur) && estMois(`${valeur}-01`);
}

export function periodeDeLAdresse(parametres: Parametres | null, courant: string): string {
  const valeur = parametres?.get('period') ?? null;
  return valeur !== null && (estMois(valeur) || estAnnee(valeur)) ? valeur : courant;
}

/**
 * Le taux de commission du relevé, s'il est UNIQUE : lu sur les pièces de la période
 * (`lines.*[].commission_rate`, en pourcentage), jamais déduit des montants. Deux taux (un bail à
 * taux propre, un autre au taux de l'agence) ou aucune pièce : `null`, et l'écran n'en dit rien.
 */
export function tauxUnique(lignes: OwnerStatement['lines']): number | null {
  const taux = new Set<number>();
  for (const cle of ['lease_payments', 'booking_payments', 'late_fees'] as const) {
    for (const ligne of lignes?.[cle] ?? []) {
      if (typeof ligne.commission_rate === 'number') taux.add(ligne.commission_rate);
    }
  }
  return taux.size === 1 ? ([...taux][0] as number) : null;
}
