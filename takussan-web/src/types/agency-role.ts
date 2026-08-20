/**
 * TCK-279 — rôles personnalisés par agence.
 *
 * Le backend est la source de vérité : `docs/models-spec.md` §52 et §53. Ces
 * types décrivent ce que l'API rend, ils ne le redéfinissent pas.
 */

/** Type de profil métier ciblé par un rôle (`AgencyRoleBaseType` côté API). */
export type AgencyRoleBaseType = 'agent' | 'agency_admin' | 'owner' | 'service_provider';

/**
 * Les types qu'un profil peut réellement porter.
 *
 * ⚠️ `service_provider` en est ABSENT, et ce n'est pas un oubli :
 * `service_provider_profiles` ne porte pas d'`agency_role_id` — le profil est
 * user-scopé et collabore avec N agences. `PATCH /profiles/{p}/agency-role`
 * refuse ce type en 422. Où vivra son rôle est une question ouverte (TCK-315).
 */
export const ASSIGNABLE_BASE_TYPES = ['agent', 'agency_admin', 'owner'] as const;
export type AssignableBaseType = (typeof ASSIGNABLE_BASE_TYPES)[number];

/** Valeur d'une capacité, de la forme `<domaine>.<verbe>`. */
export type CapabilityValue = string;

export interface AgencyRole {
  readonly id: number;
  readonly agency_id: number;
  readonly name: string;
  readonly base_profile_type: AgencyRoleBaseType;
  readonly description: string | null;
  readonly is_system: boolean;
  readonly is_clonable: boolean;
  /** Liste plate de valeurs — présente quand la relation est chargée. */
  readonly capabilities?: readonly CapabilityValue[];
  /** Nombre de profils portant ce rôle — alimente le 409 de suppression. */
  readonly profiles_count?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
}

/** `GET /api/capabilities` — catalogue plateforme, groupé par domaine. */
export interface CapabilityCatalogue {
  readonly domains: readonly {
    readonly domain: string;
    readonly capabilities: readonly CapabilityValue[];
  }[];
  readonly total: number;
  /**
   * Capacités réservées à la PLATEFORME. La matrice d'édition doit les
   * **griser** : l'API les refuse en 422, et une case cochable qui rend 422
   * est un défaut d'UI, pas une garde.
   */
  readonly platform_reserved: readonly CapabilityValue[];
}

export interface CreateAgencyRoleInput {
  readonly name: string;
  readonly base_profile_type: AgencyRoleBaseType;
  readonly description?: string | null;
  /** Clone d'un rôle de la MÊME agence et du MÊME `base_profile_type`. */
  readonly clone_from?: number | null;
}

export interface UpdateAgencyRoleInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly is_clonable?: boolean;
}

/**
 * `PATCH /api/profiles/{profile}/agency-role`.
 *
 * ⚠️ `profile_type` est obligatoire **dans le corps** : les profils sont
 * polymorphes, l'id 12 existe simultanément dans `agent_profiles`,
 * `owner_profiles` et `agency_admin_profiles`. Un id nu ne désigne rien.
 */
export interface AssignAgencyRoleInput {
  readonly profile_type: AssignableBaseType;
  readonly agency_role_id: number;
}

/**
 * `GET /api/agencies/{agency}/role-assignments` — ce que porte chaque profil
 * agence-scopé des utilisateurs demandés.
 *
 * Un utilisateur peut apparaître PLUSIEURS fois : rien n'interdit d'être à la
 * fois agent et propriétaire dans la même agence, et ces deux profils portent
 * chacun leur rôle. La console Équipe affiche donc une liste, pas une valeur.
 */
export interface AgencyRoleAssignment {
  readonly profile_id: number;
  readonly profile_type: AssignableBaseType;
  readonly user_id: number;
  readonly agency_role_id: number;
  readonly agency_role_name: string | null;
}

/** Profil bloquant la suppression d'un rôle — corps du 409. */
export interface BlockingProfile {
  readonly id: number;
  readonly type: AgencyRoleBaseType;
  readonly user_id: number | null;
  readonly display_name: string | null;
}

export interface DeleteRoleConflict {
  readonly message: string;
  readonly profiles: readonly BlockingProfile[];
}
