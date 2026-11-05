import { isSuperAdmin, isTenant } from '@/lib/roles';
import { PROFILE_TYPES, type ProfileType } from '@/types/profile';
import type { UserRole } from '@/types/user';

/**
 * TCK-2477 (ADR-0089 §2) — les huit personas du menu de `/app`.
 *
 * `hote` est l'admin d'une agence `individual` : l'assistant hôte y crée DEUX profils (admin et
 * bailleur) pour une seule personne, que le sélecteur présente déjà comme un seul espace
 * (`espacesAProposer`, TCK-497). Le menu suit.
 */
export const PERSONAS = [
  'client',
  'locataire',
  'bailleur',
  'agent',
  'admin-agence',
  'hote',
  'prestataire',
  'plateforme',
] as const;

export type Persona = (typeof PERSONAS)[number];

/** Le type de profil le plus « fort » quand aucun profil actif n'est connu — l'ordre de `RANG` (`lib/roles.ts`). */
const TYPE_DOMINANT: readonly ProfileType[] = ['agency_admin', 'agent', 'owner', 'service_provider'];

/** `agency_admin:12` → `agency_admin`. Tout autre jeton (dont le profil de plateforme) → `null`. */
export function typeDuProfilActif(identifiant: string | null | undefined): ProfileType | null {
  const type = identifiant?.split(':')[0] ?? '';
  return (PROFILE_TYPES as readonly string[]).includes(type) ? (type as ProfileType) : null;
}

export interface ContexteDePersona {
  readonly roles: UserRole[];
  /** Le type du profil actif (cookie `active_profile_id`), `null` s'il n'est pas connu. */
  readonly typeProfilActif?: ProfileType | null;
  /** L'agence du profil actif est `individual` (`agencyIsStandard === false`). */
  readonly agenceIndividuelle?: boolean;
}

/**
 * Le persona d'après le PROFIL ACTIF, jamais d'après l'union de `roles` seule : `roles` additionne
 * les profils actifs de l'espace (ADR-0005, amendement du 2026-10-23), et un admin d'agence qui est
 * aussi bailleur y porte les deux.
 *
 * Un profil actif absent de `roles` (cookie périmé, profil suspendu) ne décide de rien : on retombe
 * sur le type dominant, comme l'auto-bascule de l'API retient d'abord `agency_admin`.
 */
export function resoudrePersona({
  roles,
  typeProfilActif = null,
  agenceIndividuelle = false,
}: ContexteDePersona): Persona {
  const actif = typeProfilActif !== null && roles.includes(typeProfilActif) ? typeProfilActif : null;
  if (actif === null && isSuperAdmin(roles)) return 'plateforme';
  const type = actif ?? TYPE_DOMINANT.find((t) => roles.includes(t)) ?? null;
  switch (type) {
    case 'agency_admin':
      return agenceIndividuelle ? 'hote' : 'admin-agence';
    case 'owner':
      return agenceIndividuelle && roles.includes('agency_admin') ? 'hote' : 'bailleur';
    case 'agent':
      return 'agent';
    case 'service_provider':
      return 'prestataire';
    default:
      return isTenant(roles) ? 'locataire' : 'client';
  }
}
