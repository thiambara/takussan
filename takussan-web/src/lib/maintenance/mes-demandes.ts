import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceStatus } from '@/types/maintenance';

/**
 * TCK-2654, lot 2 — « Interventions » du locataire : la demande terminée qui attend sa réponse en
 * tête, puis ce qui est en cours, puis ce qui est clos. Aucun montant : la liste ne LIT aucune
 * colonne de coût ni de devis (l'API ne les sert pas au locataire, TCK-2652 ; la liste ne les
 * demande pas non plus).
 */

/**
 * Les colonnes que la liste du locataire lit. `status`, `assigned_to`, `scheduled_at`,
 * `completed_at` et `queue_entered_at` nourrissent `auto_close_at` (TCK-2652) — sans eux, l'API le
 * rend à `null`. Ni `estimated_cost`, ni `actual_cost`, ni `quote_*`.
 */
export const CHAMPS_DES_DEMANDES_DU_LOCATAIRE = [
  'id',
  'property_id',
  'lease_id',
  'requester_id',
  'assigned_to',
  'title',
  'category',
  'priority',
  'status',
  'scheduled_at',
  'completed_at',
  'queue_entered_at',
  'created_at',
] as const;

/** Clos pour le locataire : la demande ne lui demande plus rien. */
const CLOSES: readonly MaintenanceStatus[] = ['closed', 'cancelled'];

export interface DemandesDuLocataire {
  /** Terminées par le prestataire, en attente de « C'est réparé » ou « Le problème persiste » — la plus récente d'abord. */
  readonly aConfirmer: readonly InterventionEnFile[];
  /** Ni terminées ni closes — dans l'ordre rendu par l'API. */
  readonly enCours: readonly InterventionEnFile[];
  /** Closes ou annulées — dans l'ordre rendu par l'API. */
  readonly closes: readonly InterventionEnFile[];
}

function instant(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Répartit les demandes en trois blocs. */
export function repartirDemandes(demandes: readonly InterventionEnFile[]): DemandesDuLocataire {
  const aConfirmer = demandes
    .filter((d) => d.status === 'completed')
    .toSorted((a, b) => instant(b.completed_at) - instant(a.completed_at));
  const enCours = demandes.filter((d) => d.status !== 'completed' && !CLOSES.includes(d.status));
  const closes = demandes.filter((d) => CLOSES.includes(d.status));
  return { aConfirmer, enCours, closes };
}

export type JourRelatif = 'aujourdhui' | 'hier' | 'demain' | 'autre';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Le jour de `iso` par rapport à `maintenant`, lu par `jourDe` (le jour calendaire au fuseau de
 * l'écran — `useFormatteurs().date`, Africa/Dakar). Dakar n'a pas d'heure d'été : un jour vaut 24 h.
 */
export function jourRelatif(iso: string | null | undefined, maintenant: Date, jourDe: (d: Date) => string): JourRelatif {
  if (!iso) return 'autre';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return 'autre';
  const jour = jourDe(instant);
  if (jour === jourDe(maintenant)) return 'aujourdhui';
  if (jour === jourDe(new Date(maintenant.getTime() - JOUR_MS))) return 'hier';
  if (jour === jourDe(new Date(maintenant.getTime() + JOUR_MS))) return 'demain';
  return 'autre';
}
