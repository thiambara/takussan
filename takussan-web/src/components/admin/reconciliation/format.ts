import type { BankStatement } from '@/types/reconciliation';

/** Les montants décimaux arrivent en chaîne (`"150000.00"`) : un nombre, ou `null`. */
export function enNombre(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : null;
}

/** La confiance d'une suggestion, ramenée à une fraction (l'API peut la rendre sur 1 ou sur 100). */
export function confianceEnFraction(valeur: number | string | null | undefined): number | null {
  const n = enNombre(valeur);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}

/** Un relevé dont l'analyse a échoué ou a sauté des lignes : le mapping CSV est à vérifier. */
export function releveAVerifier(releve: BankStatement): boolean {
  return releve.status === 'failed' || (releve.skipped_lines_count ?? 0) > 0;
}

/** Un relevé finalisé (ou archivé) ne se modifie plus. */
export function releveFige(releve: BankStatement): boolean {
  return releve.finalized_at !== null || releve.status === 'reconciled' || releve.status === 'archived';
}
