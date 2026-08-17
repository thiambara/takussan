<?php

use App\Models\Enums\AgencyRoleBaseType;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-315 (ADR-0015) — migration de DONNÉES. Chaque collaboration
 * prestataire↔agence existante reçoit le rôle système `service_provider`
 * de **SON** agence.
 *
 * **Soft-deletées comprises** : la migration suivante passe la colonne NOT
 * NULL, et une contrainte de colonne ne connaît pas `deleted_at`. Une seule
 * ligne laissée de côté ferait échouer le déploiement.
 *
 * Écrite en SQL brut via `DB` et non via Eloquent, comme le backfill de
 * TCK-279 : une migration de données doit rester juste le jour où les
 * modèles auront changé — et le hook `creating` de `HasAgencyRole`, qui pose
 * le rôle par défaut à la création, ne s'applique pas à des lignes qui
 * existent déjà.
 *
 * Idempotente (`whereNull` + recherche-avant-création), donc rejouable.
 *
 * Le rôle système `service_provider` est normalement déjà seedé dans chaque
 * agence — par le backfill 120300 de TCK-279 pour les agences antérieures,
 * par `AgencyObserver::created` pour les suivantes. On ne le **suppose**
 * pourtant pas : cette migration le crée au besoin, capacités comprises.
 * Supposer l'état laissé par une migration antérieure, c'est déduire au lieu
 * de mesurer, et le coût de la vérification est ici d'une requête par agence.
 */
return new class extends Migration
{
    private const TABLE = 'service_provider_agency_collaborations';

    public function up(): void
    {
        $type = AgencyRoleBaseType::ServiceProvider;
        $capabilities = (new SystemRoleCapabilities)->valuesFor($type);
        $now = now();

        // On boucle sur les agences QUI PORTENT une collaboration à rattacher,
        // pas sur toutes les agences : sur une base où la plupart des agences
        // n'ont aucun prestataire, cela évite autant de requêtes inutiles.
        $agencyIds = DB::table(self::TABLE)
            ->whereNull('agency_role_id')
            ->distinct()
            ->pluck('agency_id');

        foreach ($agencyIds as $agencyId) {
            $roleId = $this->ensureSystemRole((int) $agencyId, $type, $now);
            $this->ensureCapabilities($roleId, $capabilities, $now);

            DB::table(self::TABLE)
                ->where('agency_id', $agencyId)
                ->whereNull('agency_role_id')
                ->update(['agency_role_id' => $roleId]);
        }

        $this->assertNoOrphanCollaboration();
    }

    /**
     * On détache, on ne supprime pas : les rôles système appartiennent à
     * TCK-279 (migration 120300), pas à celle-ci. Les supprimer ici
     * casserait les trois tables de profils qui les portent en NOT NULL.
     */
    public function down(): void
    {
        DB::table(self::TABLE)->update(['agency_role_id' => null]);
    }

    private function ensureSystemRole(int $agencyId, AgencyRoleBaseType $type, mixed $now): int
    {
        $existing = DB::table('agency_roles')
            ->where('agency_id', $agencyId)
            ->where('base_profile_type', $type->value)
            ->where('is_system', true)
            ->value('id');

        if ($existing !== null) {
            return (int) $existing;
        }

        return (int) DB::table('agency_roles')->insertGetId([
            'agency_id' => $agencyId,
            'name' => $type->defaultRoleName(),
            'base_profile_type' => $type->value,
            'description' => null,
            'is_system' => true,
            'is_clonable' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    /**
     * @param  array<int,string>  $capabilities
     */
    private function ensureCapabilities(int $roleId, array $capabilities, mixed $now): void
    {
        $known = DB::table('agency_role_capabilities')
            ->where('agency_role_id', $roleId)
            ->pluck('capability')
            ->all();

        $rows = [];
        foreach (array_diff($capabilities, $known) as $capability) {
            $rows[] = [
                'agency_role_id' => $roleId,
                'capability' => $capability,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            DB::table('agency_role_capabilities')->insert($rows);
        }
    }

    /**
     * Garde-fou : la migration suivante passe la colonne NOT NULL. Une
     * collaboration restée orpheline y ferait échouer le déploiement au
     * mieux, et priverait un prestataire de toutes ses capacités dans cette
     * agence au pire. On préfère un échec ici, avec le compte exact.
     */
    private function assertNoOrphanCollaboration(): void
    {
        $orphans = DB::table(self::TABLE)->whereNull('agency_role_id')->count();

        if ($orphans > 0) {
            throw new RuntimeException(
                "TCK-315 backfill: {$orphans} collaboration(s) prestataire sans `agency_role_id`. ".
                'Migration interrompue avant le passage NOT NULL.'
            );
        }
    }
};
