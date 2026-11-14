import type { ExportEntity, ExportFormat } from '@/lib/queries/exports';

/**
 * TCK-2629 — ce que l'onglet « Exports » de Rapports partage entre ses trois entrées : les cartes prêtes,
 * l'export personnalisé et « Refaire ». **Une carte prête est un export comme un autre** : mêmes types
 * permis, mêmes plafonds, même journal ; un seul calcul des types permis, ici.
 *
 * TCK-587 (ADR-0031 § 2) — la capacité qui ouvre chaque export au PERSONNEL, comme
 * `ExportController::CAPABILITY`. Le bailleur n'en tient aucune : il exporte ses paiements, ses baux et
 * ses biens, jamais les clients de l'agence ni ses chiffres financiers (TCK-595 § 7).
 */
export const CAPACITE_DE_L_EXPORT: Readonly<Record<ExportEntity, string>> = {
  payments: 'payments.export',
  leases: 'reports.export',
  customers: 'crm.export',
  properties: 'reports.export',
  payouts: 'reports.export',
  invoices: 'reports.export',
  commissions: 'reports.export',
  aging: 'reports.export',
  deposits: 'reports.export',
};

export const TOUS_LES_EXPORTS: readonly ExportEntity[] = [
  'payments',
  'leases',
  'customers',
  'properties',
  'payouts',
  'invoices',
  'commissions',
  'aging',
  'deposits',
];

export const EXPORTS_DU_BAILLEUR: readonly ExportEntity[] = ['payments', 'leases', 'properties'];

export const CAPACITES_D_EXPORT = ['payments.export', 'reports.export', 'crm.export'] as const;

/** Les types que ce compte peut exporter AUJOURD'HUI : par capacité pour le personnel, les trois du bailleur sinon. */
export function exportsPermis(staff: boolean, tenues: Readonly<Record<string, boolean>>): ExportEntity[] {
  return staff ? TOUS_LES_EXPORTS.filter((e) => tenues[CAPACITE_DE_L_EXPORT[e]] === true) : [...EXPORTS_DU_BAILLEUR];
}

export function estUnExport(entity: unknown): entity is ExportEntity {
  return typeof entity === 'string' && (TOUS_LES_EXPORTS as readonly string[]).includes(entity);
}

export function estUnFormat(format: unknown): format is ExportFormat {
  return format === 'csv' || format === 'xlsx' || format === 'pdf';
}

/** Les préréglages de période de l'export personnalisé (maquette : « Mois dernier · Ce mois · Année 2026 »). */
export type Prereglage = 'moisDernier' | 'ceMois' | 'annee';
export const PREREGLAGES: readonly Prereglage[] = ['moisDernier', 'ceMois', 'annee'];

export interface Periode {
  readonly from: string;
  readonly to: string;
}

const jour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Les bornes d'un préréglage, en dates `AAAA-MM-JJ`. `Africa/Dakar` est UTC+0 toute l'année, sans heure
 * d'été : le jour UTC EST le jour de Dakar (même raisonnement que `TeamPerformanceTable`).
 */
export function bornesDuPrereglage(cle: Prereglage, maintenant: Date = new Date()): Periode {
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth();
  switch (cle) {
    case 'moisDernier':
      // `Date.UTC(annee, mois, 0)` : le dernier jour du mois précédent — janvier donne le 31 décembre.
      return { from: jour(new Date(Date.UTC(annee, mois - 1, 1))), to: jour(new Date(Date.UTC(annee, mois, 0))) };
    case 'ceMois':
      return { from: jour(new Date(Date.UTC(annee, mois, 1))), to: jour(new Date(Date.UTC(annee, mois + 1, 0))) };
    case 'annee':
      return { from: `${annee}-01-01`, to: `${annee}-12-31` };
  }
}

/** Le préréglage qui produit exactement ces bornes (pour allumer sa puce), sinon `null`. */
export function prereglageDe(periode: { readonly from: string; readonly to: string }, maintenant: Date = new Date()): Prereglage | null {
  return PREREGLAGES.find((p) => {
    const b = bornesDuPrereglage(p, maintenant);
    return b.from === periode.from && b.to === periode.to;
  }) ?? null;
}

/**
 * Les cartes prêtes, dans l'ordre de la maquette (« Exports rapides »). Une carte dont le type n'est pas
 * permis n'est PAS rendue (`cartesPermises`). « Baux » et non « Baux actifs » : l'export des baux n'a pas
 * de filtre de statut (`ExportDataService::leases`), la carte ne promet pas ce que le fichier ne fait pas.
 */
export interface CartePrete {
  readonly id: string;
  readonly entity: ExportEntity;
  readonly format: ExportFormat;
  /** Sans préréglage : tout l'historique (l'API n'applique aucune borne). */
  readonly periode?: Prereglage;
}

export const CARTES_PRETES: readonly CartePrete[] = [
  { id: 'paiements', entity: 'payments', format: 'xlsx', periode: 'moisDernier' },
  { id: 'baux', entity: 'leases', format: 'xlsx' },
  { id: 'balance', entity: 'aging', format: 'pdf' },
  { id: 'reversements', entity: 'payouts', format: 'xlsx', periode: 'moisDernier' },
  { id: 'commissions', entity: 'commissions', format: 'xlsx', periode: 'annee' },
  { id: 'cautions', entity: 'deposits', format: 'pdf' },
];

export function cartesPermises(permis: readonly ExportEntity[]): CartePrete[] {
  return CARTES_PRETES.filter((c) => permis.includes(c.entity));
}
