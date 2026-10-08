import type { AgencyModerationAction } from '@/lib/queries/super-admin';

/**
 * TCK-600 (ADR-0048 §6) — les transitions qu'une agence peut prendre depuis la console, partagées
 * par la carte de la liste et la fiche : seules celles qui changent quelque chose, et une agence
 * suspendue n'a qu'une sortie, `reinstate` (l'API refuse `verify` et `unverify` :
 * `agency.reinstate_first`).
 */
export function transitionsDeModeration(agency: {
  status: string | null;
  is_verified: boolean;
}): AgencyModerationAction[] {
  const status = agency.status ?? 'inactive';
  if (status === 'suspended') return ['reinstate'];

  const transitions: AgencyModerationAction[] = [];
  if (!(agency.is_verified && status === 'active')) transitions.push('verify');
  transitions.push('suspend');
  // `unverify` passe AUSSI le statut à `inactive` : il change quelque chose tant que l'agence est
  // vérifiée OU pas encore inactive — c'est la seule voie vers `inactive`.
  if (agency.is_verified || status !== 'inactive') transitions.push('unverify');
  return transitions;
}

/** Les gestes qui exigent un motif (API : `SuspendAgencyRequest`, `ReinstateAgencyRequest`). */
export const AVEC_MOTIF: ReadonlySet<AgencyModerationAction> = new Set(['suspend', 'reinstate']);

/** Le geste plateforme que chaque transition exige ; `undefined` = `super_admin` seul. */
export const GESTE_DE_TRANSITION = {
  verify: undefined,
  unverify: undefined,
  suspend: 'platform.agencies.suspend',
  reinstate: 'platform.agencies.suspend',
} as const;
