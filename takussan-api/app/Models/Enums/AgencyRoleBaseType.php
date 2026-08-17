<?php

namespace App\Models\Enums;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;

/**
 * TCK-279 — type de profil métier ciblé par un `AgencyRole`.
 *
 * Cf. models-spec.md §52 (`AgencyRole.base_profile_type`).
 *
 * ⚠️ `service_provider_profiles` ne porte **pas** de `agency_role_id`, et
 * n'en portera pas : ce profil est user-scopé (`user_id` UNIQUE, aucune
 * colonne `agency_id`) et collabore avec N agences. Y planter un pointeur
 * vers le rôle d'UNE agence contredirait « l'agence est la frontière
 * d'isolation ».
 *
 * TCK-315 (ADR-0016) a tranché : **le rôle d'un prestataire vit sur
 * `service_provider_agency_collaborations.agency_role_id`** — une ligne par
 * agence, donc un rôle par agence. C'est pourquoi `profileClass()` et
 * `profileTable()` rendent `null` pour ce cas : son porteur existe, il n'est
 * simplement pas un profil.
 */
enum AgencyRoleBaseType: string
{
    case Agent = 'agent';
    case AgencyAdmin = 'agency_admin';
    case Owner = 'owner';
    case ServiceProvider = 'service_provider';

    /**
     * Libellé par défaut du rôle système seedé pour ce type. Le front
     * possède le texte affiché (principe 5) : ces valeurs ne sont qu'un
     * défaut stockable, l'UI traduit sur `base_profile_type`.
     */
    public function defaultRoleName(): string
    {
        return match ($this) {
            self::Agent => 'Agent',
            self::AgencyAdmin => 'Administrateur',
            self::Owner => 'Propriétaire',
            self::ServiceProvider => 'Prestataire',
        };
    }

    /**
     * FQN du modèle de profil correspondant, ou `null` quand ce type n'a
     * pas de profil agence-scopé porteur d'un `agency_role_id`.
     *
     * @return class-string|null
     */
    public function profileClass(): ?string
    {
        return match ($this) {
            self::Agent => AgentProfile::class,
            self::AgencyAdmin => AgencyAdminProfile::class,
            self::Owner => OwnerProfile::class,
            self::ServiceProvider => null,
        };
    }

    /**
     * Table du profil correspondant, ou `null` (cf. `profileClass()`).
     */
    public function profileTable(): ?string
    {
        return match ($this) {
            self::Agent => 'agent_profiles',
            self::AgencyAdmin => 'agency_admin_profiles',
            self::Owner => 'owner_profiles',
            self::ServiceProvider => null,
        };
    }

    /**
     * Les types dont le porteur du `agency_role_id` est une **table de
     * PROFIL** — c'est-à-dire ceux que `profileClass()` sait résoudre.
     *
     * ⚠️ Ce n'est plus « les types qui portent un `agency_role_id` » : depuis
     * TCK-315, `service_provider` en porte un aussi, sur sa table de
     * COLLABORATION. Le résolveur le traite par une branche distincte, parce
     * que la requête n'est pas la même — pas parce qu'il n'aurait pas de rôle.
     *
     * @return array<int,self>
     */
    public static function assignableTypes(): array
    {
        return [self::Agent, self::AgencyAdmin, self::Owner];
    }
}
