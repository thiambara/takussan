import type { BoostProduct, BoostVariant, PropertyBoost } from './types';

/**
 * TCK-824 (P24.02, ADR-0061 §5) — ce que l'offre choisie fera au boost déjà en place, dit AVANT la
 * confirmation : un badge remplace le badge vivant sans remboursement, une Vedette prolonge la
 * Vedette vivante, une Remontée attend la fin de son délai. `null` : rien à dire.
 */
export type EffetAchat =
  | { readonly type: 'remplaceBadge'; readonly variant: BoostVariant; readonly jusquA: string | null }
  | { readonly type: 'prolongeVedette'; readonly jusquA: string | null; readonly jours: number }
  | { readonly type: 'remonteeEnDelai'; readonly aPartirDu: string }
  | null;

const VIVANTS = new Set(['active', 'paused']);
const JOUR_MS = 86_400_000;

export function effetAchat(
  offre: BoostProduct | null,
  boosts: readonly PropertyBoost[],
  remonteePossibleLe: string | null,
  maintenant: number,
): EffetAchat {
  if (!offre) return null;
  const vivant = boosts.find((b) => b.kind === offre.kind && VIVANTS.has(b.status));

  if (offre.kind === 'bump') {
    return remonteePossibleLe && Date.parse(remonteePossibleLe) > maintenant
      ? { type: 'remonteeEnDelai', aPartirDu: remonteePossibleLe }
      : null;
  }
  if (!vivant) return null;

  if (offre.kind === 'badge') {
    return {
      type: 'remplaceBadge',
      variant: vivant.variant ?? 'urgent',
      jusquA: vivant.status === 'active' ? vivant.ends_at : null,
    };
  }

  // Comme l'API : une Vedette active se prolonge depuis sa fin, ou depuis maintenant si elle est
  // échue sans être close ; une Vedette en pause gagne des jours, sans date de fin.
  if (vivant.status !== 'active' || !vivant.ends_at) {
    return { type: 'prolongeVedette', jusquA: null, jours: offre.duration_days };
  }
  const depuis = Math.max(Date.parse(vivant.ends_at), maintenant);
  return {
    type: 'prolongeVedette',
    jusquA: new Date(depuis + offre.duration_days * JOUR_MS).toISOString(),
    jours: offre.duration_days,
  };
}
