<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;

/**
 * TCK-279 — seed des 4 rôles système d'une agence.
 *
 * Appelé par `AgencyObserver::created` (AC1) et par la migration de
 * backfill pour les agences antérieures. **Idempotent** : deux appels
 * concurrents ne produisent pas de doublon, la contrainte unique
 * `(agency_id, name)` refusant le second.
 *
 * La spec exige « exactement un rôle système par (agency_id,
 * base_profile_type) ». MySQL 8.0 ne sait pas exprimer un unique partiel
 * (`WHERE is_system = true`) : cet invariant est tenu ici, et nulle part
 * ailleurs — aucun chemin d'API ne crée de rôle `is_system=true`.
 */
class AgencySystemRoleSeeder
{
    public function __construct(
        private readonly SystemRoleCapabilities $catalog,
        private readonly AgencyRoleCapabilityCache $cache,
    ) {}

    /**
     * @return array<string,AgencyRole> indexé par `base_profile_type`
     */
    public function seed(Agency $agency): array
    {
        $roles = [];
        foreach (AgencyRoleBaseType::cases() as $type) {
            $roles[$type->value] = $this->systemRoleFor((int) $agency->id, $type);
        }

        return $roles;
    }

    /**
     * Rôle système du type donné dans l'agence, créé au besoin.
     */
    public function systemRoleFor(int $agencyId, AgencyRoleBaseType $type): AgencyRole
    {
        $role = AgencyRole::query()
            ->where('agency_id', $agencyId)
            ->where('base_profile_type', $type->value)
            ->where('is_system', true)
            ->first();

        if ($role !== null) {
            return $role;
        }

        $role = AgencyRole::query()->create([
            'agency_id' => $agencyId,
            'name' => $type->defaultRoleName(),
            'base_profile_type' => $type->value,
            'is_system' => true,
            'is_clonable' => true,
        ]);

        $rows = [];
        $now = now();
        foreach ($this->catalog->valuesFor($type) as $capability) {
            $rows[] = [
                'agency_role_id' => $role->id,
                'capability' => $capability,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        if ($rows !== []) {
            AgencyRoleCapability::query()->insert($rows);
        }

        $this->cache->forget((int) $role->id);

        return $role;
    }
}
