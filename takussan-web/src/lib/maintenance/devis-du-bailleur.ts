import { CHAMPS_D_UNE_CARTE, type InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';

/**
 * TCK-2654, lot 3 — « Interventions » du bailleur : le devis qui attend son accord, puis ce qui est
 * en cours sur ses biens. Le bailleur est un donneur d'ordre : il lit le devis et le coût (TCK-592,
 * TCK-2652), et le plafond qu'il a fixé (`owner_approval_threshold`, servi au DÉTAIL seulement,
 * décision 1a).
 */

/** Le devis attend le bailleur : `awaiting_owner` (ADR-0037), le seul statut où il tranche. */
export const STATUT_DU_DEVIS_A_DECIDER: MaintenanceStatus = 'awaiting_owner';

/**
 * Ce qui est « en cours sur vos biens » : ni terminé ni clos, et pas le devis qui l'attend (sa carte
 * est au-dessus). Filtré par l'API (`filter[status]`), jamais sur une page déjà lue.
 */
export const STATUTS_EN_COURS_DU_BAILLEUR: readonly MaintenanceStatus[] = [
  'open',
  'acknowledged',
  'quote_requested',
  'quote_submitted',
  'approved',
  'assigned',
  'in_progress',
];

/**
 * Les colonnes d'une ligne du bailleur : celles de la carte d'une file (dont `queue_entered_at`, la
 * source de `waiting_since`), plus le coût et la décision du devis.
 */
export const CHAMPS_DES_INTERVENTIONS_DU_BAILLEUR = [
  ...CHAMPS_D_UNE_CARTE,
  'estimated_cost',
  'actual_cost',
  'quote_submitted_at',
  'quote_decision_at',
] as const;

/** Le plafond, lu au détail : absent pour qui ne le lit pas, `null` quand le bailleur n'en a pas fixé. */
export type FicheDuBailleur = MaintenanceRequest & { readonly owner_approval_threshold?: number | null };

/** Le montant d'une ligne en cours : le coût réel s'il est inscrit, sinon le devis, sinon l'estimation. */
export function montantDUneLigne(i: Pick<InterventionEnFile, 'actual_cost' | 'quote_amount' | 'estimated_cost'>): number | null {
  return i.actual_cost ?? i.quote_amount ?? i.estimated_cost ?? null;
}

/**
 * Le rappel du plafond, seulement quand l'API le sert ET qu'il est fixé. Le dépassement n'est jamais
 * recalculé ici : c'est l'API qui met le devis en `awaiting_owner`, et `can_decide_quote` qui ouvre
 * les gestes.
 */
export function plafondARappeler(fiche: FicheDuBailleur | undefined): number | null {
  const plafond = fiche?.owner_approval_threshold;
  return typeof plafond === 'number' ? plafond : null;
}

/**
 * « Sous le seuil : sans accord » : un devis au plus égal au plafond du bailleur s'approuve sans lui.
 * C'est la règle d'`approveQuote` (`MaintenanceQuoteWorkflow`) : l'approbation de l'agence ne passe en
 * `awaiting_owner` que STRICTEMENT au-delà du plafond (`OwnerApprovalThreshold::exceeds`, ADR-0037 § 2 —
 * égal, c'est dans l'accord). Faux sans plafond servi et fixé, ou sans devis.
 */
export function sousLeSeuil(quoteAmount: number | string | null | undefined, plafond: number | null): boolean {
  if (plafond === null || quoteAmount === null || quoteAmount === undefined) return false;
  const montant = Number(quoteAmount);
  return Number.isFinite(montant) && montant <= plafond;
}
