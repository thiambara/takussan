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

/**
 * Le type retenu quand aucun profil actif n'est LISIBLE (cookie `active_profile_id` absent — la
 * connexion ne le pose pas —, périmé, ou impersonation) : celui que l'API retient alors.
 *
 * TCK-2479 — c'est l'ordre de l'auto-bascule de l'API, PAS celui de `RANG` (`lib/roles.ts`) :
 * `ResolveActiveProfile` (`takussan-api/app/Http/Middleware/ResolveActiveProfile.php:150`) lie le
 * premier profil actif de `HasProfiles::profiles()`
 * (`takussan-api/app/Models/Concerns/HasProfiles.php:118`) — bailleurs, agents, admins, puis
 * prestataire. Avant, l'admin passait d'abord : un compte admin ET bailleur d'une agence standard
 * avait le menu `admin-agence` quand l'API jugeait chaque requête sous `owner:N` (mesuré le
 * 2026-11-05). L'ordre de l'API est figé par
 * `ProfilesEndpointTest::test_l_auto_bascule_retient_le_premier_type_dans_l_ordre_de_profiles`, et
 * le PHP renvoie ici. L'hôte (agence `individual`, admin + bailleur) reste `hote` dans les deux ordres.
 */
const TYPE_DOMINANT: readonly ProfileType[] = ['owner', 'agent', 'agency_admin', 'service_provider'];

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
 * sur `TYPE_DOMINANT`, l'ordre de l'auto-bascule de l'API (bailleur d'abord). Ce commentaire disait
 * « l'auto-bascule de l'API retient d'abord `agency_admin` » : c'était faux (TCK-2479).
 *
 * ⚠ Un compte de PLUSIEURS agences n'a pas d'auto-bascule côté API (aucun profil lié) : le repli
 * n'y imite rien, il choisit seulement un menu.
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

/** Les types de profil qu'un persona REPRÉSENTE. L'hôte en fusionne deux (TCK-497). */
export const TYPES_DU_PERSONA: Record<Persona, readonly ProfileType[]> = {
  client: [],
  locataire: [],
  bailleur: ['owner'],
  agent: ['agent'],
  'admin-agence': ['agency_admin'],
  hote: ['agency_admin', 'owner'],
  prestataire: ['service_provider'],
  plateforme: [],
};

const ROLES_TOUJOURS_GARDES: readonly UserRole[] = ['customer', 'tenant', 'super_admin'];

/**
 * TCK-2478 (ADR-0089 §2) — les rôles sur lesquels se juge la DISPOSITION : les rôles dérivés
 * (`customer`, `tenant`), le super-admin (global), et les seuls types que le persona représente.
 * Le reste de l'union de l'espace nourrit le complément « Aussi … ».
 */
export function rolesDuPersona(roles: UserRole[], persona: Persona): UserRole[] {
  const types: readonly UserRole[] = TYPES_DU_PERSONA[persona];
  return roles.filter((r) => ROLES_TOUJOURS_GARDES.includes(r) || types.includes(r));
}

/** Les autres types de profil que le compte tient dans l'espace, dans l'ordre de `PROFILE_TYPES`. */
export function autresTypes(roles: UserRole[], persona: Persona): ProfileType[] {
  return PROFILE_TYPES.filter((t) => roles.includes(t) && !TYPES_DU_PERSONA[persona].includes(t));
}
