import type { ThresholdAlert } from '@/lib/queries/alerts';

/**
 * TCK-2629 — ce que l'onglet « Alertes » lit d'une alerte de seuil, en fonctions pures : la jauge (où en
 * est la valeur actuelle, où est le trait du seuil, la règle sonne-t-elle) et la forme de ses chiffres.
 */

export const METRIQUES_D_ALERTE = [
  'unpaid_rate_percent',
  'occupancy_rate_percent',
  'overdue_count',
  'overdue_amount',
  'bookings_pending',
  'maintenance_open',
] as const;
export type MetriqueDAlerte = (typeof METRIQUES_D_ALERTE)[number];

export type FormeDeMetrique = 'pourcent' | 'montant' | 'nombre';

/** `unpaid_rate_percent` et `occupancy_rate_percent` sont déjà des POURCENTAGES (3,91 et non 0,0391). */
export function formeDeLaMetrique(metric: string): FormeDeMetrique {
  if (metric.endsWith('_percent')) return 'pourcent';
  if (metric.endsWith('_amount')) return 'montant';
  return 'nombre';
}

/** Le trait du seuil se pose aux deux tiers de la jauge (maquette `JaugeSeuil`, `left: 66.7%`). */
export const POSITION_DU_SEUIL = 200 / 3;

export interface Jauge {
  /** Largeur du remplissage, en % de la jauge (0–100). */
  readonly part: number;
  /** Position du trait du seuil, en % de la jauge. */
  readonly seuil: number;
  /** La règle est franchie par la valeur actuelle. */
  readonly sonne: boolean;
}

export function sonne(valeur: number, operateur: ThresholdAlert['operator'], seuil: number): boolean {
  switch (operateur) {
    case '>':
      return valeur > seuil;
    case '>=':
      return valeur >= seuil;
    case '<':
      return valeur < seuil;
    case '<=':
      return valeur <= seuil;
  }
}

/**
 * La jauge d'une alerte, lue de `current_value` : `null` sans valeur actuelle (jamais 0 à sa place, qui
 * dirait « tout va bien » d'une mesure absente). L'échelle va de 0 à 1,5 × le seuil, le trait à 2/3 ; un
 * seuil nul ou négatif n'a pas d'échelle lisible : la jauge est pleine ou vide selon la règle.
 */
export function jaugeDeLAlerte(alerte: Pick<ThresholdAlert, 'operator' | 'threshold' | 'current_value'>): Jauge | null {
  const valeur = alerte.current_value;
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return null;
  const seuil = Number(alerte.threshold);
  if (!Number.isFinite(seuil)) return null;
  const franchie = sonne(valeur, alerte.operator, seuil);
  if (seuil <= 0) return { part: franchie ? 100 : 0, seuil: POSITION_DU_SEUIL, sonne: franchie };
  const max = seuil * 1.5;
  const part = Math.max(0, Math.min(100, (valeur / max) * 100));
  return { part, seuil: POSITION_DU_SEUIL, sonne: franchie };
}

/** Le dernier déclenchement : le plus récent du journal (`triggers`), sinon `last_triggered_at`, sinon jamais. */
export function dernierDeclenchement(alerte: Pick<ThresholdAlert, 'triggers' | 'last_triggered_at'>): string | null {
  return alerte.triggers?.[0]?.at ?? alerte.last_triggered_at ?? null;
}
