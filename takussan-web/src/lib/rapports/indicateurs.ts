import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import type { KpiConfig } from '@/lib/queries/kpis';

/**
 * TCK-2629 — « Personnaliser les chiffres » de la vue d'ensemble : l'ordre et le masquage des indicateurs
 * de l'agence (`kpi_configs`, TCK-032 P3), lus par les tuiles (TCK-2373), en fonctions pures.
 */

/** Une ligne du réglage : ce que l'écran peut changer avant « Terminé ». */
export type ChiffreRegle = Pick<KpiConfig, 'id' | 'metric' | 'label' | 'format' | 'sort_order' | 'is_enabled'>;

/** L'ordre de l'API : `sort_order`, puis l'identifiant (`fetchKpisActifs`, `sort=sort_order,id`). */
export function ordonner<T extends Pick<KpiConfig, 'id' | 'sort_order'>>(configs: readonly T[]): T[] {
  return [...configs].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

/** Déplacer la ligne `de` à la place `a` (glisser, ou monter/descendre au clavier). */
export function deplacer<T>(lignes: readonly T[], de: number, a: number): T[] {
  if (de === a || de < 0 || a < 0 || de >= lignes.length || a >= lignes.length) return [...lignes];
  const copie = [...lignes];
  const [ligne] = copie.splice(de, 1);
  copie.splice(a, 0, ligne!);
  return copie;
}

export interface Ecriture {
  readonly id: number;
  readonly sort_order?: number;
  readonly is_enabled?: boolean;
}

/**
 * Les écritures que « Terminé » envoie : le rang de chaque ligne devient son `sort_order` (0, 1, 2…), et
 * seules partent les lignes dont le rang ou `is_enabled` a changé — `PATCH kpi-configs/{id}` par ligne.
 */
export function ecrituresDuReglage(avant: readonly ChiffreRegle[], apres: readonly ChiffreRegle[]): Ecriture[] {
  const parId = new Map(avant.map((c) => [c.id, c]));
  return apres.flatMap((c, rang) => {
    const ancien = parId.get(c.id);
    if (!ancien) return [];
    const ecriture: { id: number; sort_order?: number; is_enabled?: boolean } = { id: c.id };
    if (ancien.sort_order !== rang) ecriture.sort_order = rang;
    if (ancien.is_enabled !== c.is_enabled) ecriture.is_enabled = c.is_enabled;
    return Object.keys(ecriture).length > 1 ? [ecriture] : [];
  });
}

/** L'écriture qui rend à une ligne ce qu'elle était avant (retour arrière d'un enregistrement en partie échoué). */
export function inverse(ecriture: Ecriture, avant: readonly ChiffreRegle[]): Ecriture {
  const ancien = avant.find((c) => c.id === ecriture.id);
  return {
    id: ecriture.id,
    ...(ecriture.sort_order !== undefined && ancien ? { sort_order: ancien.sort_order } : {}),
    ...(ecriture.is_enabled !== undefined && ancien ? { is_enabled: ancien.is_enabled } : {}),
  };
}

/**
 * L'aperçu de la valeur de chaque métrique du catalogue, lu du résumé de l'agence que la vue d'ensemble a
 * déjà chargé — la même table que l'API (`KpiResolver::flatten`). `null` : pas de dénominateur.
 */
export function apercusDuResume(s: DashboardAgencySummary): Record<string, number | null> {
  return {
    properties_total: s.properties.total,
    properties_rented: s.properties.rented,
    properties_available: s.properties.available,
    leases_active: s.leases.active,
    customers_count: s.customers_count,
    members_count: s.members_count,
    bookings_pending: s.bookings.pending,
    maintenance_open: s.maintenance.open,
    revenue_month: s.finance.revenue_month,
    commission_month: s.finance.commission_month,
    overdue_count: s.finance.overdue_count,
    overdue_amount: s.finance.overdue_amount,
    unpaid_rate_percent: s.finance.unpaid_rate_percent,
    occupancy_rate_percent: s.occupancy.rate_percent,
  };
}

/** Le format proposé par défaut pour une métrique ajoutée : un taux en pourcentage, une somme en montant. */
export function formatParDefaut(metric: string): KpiConfig['format'] {
  if (metric.endsWith('_percent')) return 'percent';
  if (metric.endsWith('_amount') || metric === 'revenue_month' || metric === 'commission_month') return 'currency';
  return 'number';
}
