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
            // TCK-317 — RÉCONCILIER, et ne pas se contenter de rendre le rôle.
            // Cette méthode sortait ici sans regarder ses capacités : le jour
            // où un cas est ajouté à `Capability`, une agence créée AVANT ne
            // l'aurait jamais reçu, une agence créée APRÈS oui, et rien ne
            // l'aurait dit. Mesuré : retirer une ligne puis rejouer `seed()`
            // rendait 42 → 41, la capacité n'était pas récupérée.
            $this->reconcile($role, $type);

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

    /**
     * TCK-317 — aligne les capacités d'un rôle SYSTÈME sur le catalogue.
     *
     * **Purement ADDITIVE, et c'est un choix, pas une facilité.** Rien
     * aujourd'hui ne retire légitimement une capacité à un rôle système — la
     * seule écriture qui le pourrait, `AgencyRoleService::replaceCapabilities`,
     * n'est atteignable que par l'API, et `AgencyRolePolicy` y refuse tout
     * rôle `is_system`. Supprimer les lignes en trop reviendrait donc à
     * traiter un cas qui n'existe pas, en prenant le risque d'effacer une
     * donnée qu'on n'a pas su expliquer. La garde, elle, SIGNALE l'écart dans
     * les deux sens : si un jour un excédent apparaît, on le verra rouge
     * plutôt que de le faire disparaître en silence.
     *
     * ⚠️ Ne touche JAMAIS un rôle personnalisé : s'écarter du catalogue est
     * exactement sa raison d'être (AC4).
     *
     * @return int le nombre de capacités ajoutées
     */
    public function reconcile(AgencyRole $role, ?AgencyRoleBaseType $type = null): int
    {
        if (! $role->is_system) {
            return 0;
        }

        $type ??= $role->base_profile_type instanceof AgencyRoleBaseType
            ? $role->base_profile_type
            : AgencyRoleBaseType::tryFrom((string) $role->base_profile_type);

        if ($type === null) {
            return 0;
        }

        $known = AgencyRoleCapability::query()
            ->where('agency_role_id', $role->id)
            ->pluck('capability')
            ->all();

        $missing = array_diff($this->catalog->valuesFor($type), $known);
        if ($missing === []) {
            return 0;
        }

        $now = now();
        AgencyRoleCapability::query()->insert(array_map(
            static fn (string $capability): array => [
                'agency_role_id' => $role->id,
                'capability' => $capability,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            array_values($missing),
        ));

        $this->cache->forget((int) $role->id);

        return count($missing);
    }

    /**
     * Écart entre un rôle système et le catalogue, dans les DEUX sens.
     * Utilisé par la garde et par la commande en `--dry-run`.
     *
     * @return array{missing:array<int,string>,extra:array<int,string>}
     */
    public function diff(AgencyRole $role): array
    {
        $type = $role->base_profile_type instanceof AgencyRoleBaseType
            ? $role->base_profile_type
            : AgencyRoleBaseType::tryFrom((string) $role->base_profile_type);

        if (! $role->is_system || $type === null) {
            return ['missing' => [], 'extra' => []];
        }

        $expected = $this->catalog->valuesFor($type);
        $actual = AgencyRoleCapability::query()
            ->where('agency_role_id', $role->id)
            ->pluck('capability')
            ->all();

        return [
            'missing' => array_values(array_diff($expected, $actual)),
            'extra' => array_values(array_diff($actual, $expected)),
        ];
    }
}
