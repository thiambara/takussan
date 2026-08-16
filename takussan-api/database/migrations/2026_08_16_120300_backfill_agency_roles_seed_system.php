<?php

use App\Models\Enums\AgencyRoleBaseType;
use App\Services\Membership\SystemRoleCapabilities;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-279 — migration de DONNÉES. Pour chaque agence existante :
 *  1. seed les 4 rôles système (`is_system=true`) avec les capacités de la
 *     table de vérité phase 1 (`SystemRoleCapabilities`, extraite du
 *     `MembershipCapabilityResolver` de TCK-278) ;
 *  2. rattache chaque profil métier existant — **soft-deletés compris**,
 *     puisque la colonne passera NOT NULL pour toutes les lignes — au rôle
 *     système de son type dans SON agence.
 *
 * Écrite en SQL brut via `DB` et non via les modèles Eloquent : une
 * migration de données doit rester juste le jour où les modèles auront
 * changé. Elle est idempotente (`firstOrCreate` manuel + `whereNull`), donc
 * rejouable sans dupliquer.
 *
 * ⚠️ `service_provider_profiles` n'est pas traitée : elle n'a pas reçu de
 * colonne `agency_role_id` (voir la migration précédente). Son rôle système
 * est tout de même seedé dans chaque agence — il sert de catalogue à l'UI
 * et de source au résolveur.
 */
return new class extends Migration
{
    public function up(): void
    {
        $catalog = new SystemRoleCapabilities;
        $now = now();

        DB::table('agencies')->orderBy('id')->chunkById(200, function ($agencies) use ($catalog, $now): void {
            foreach ($agencies as $agency) {
                foreach (AgencyRoleBaseType::cases() as $type) {
                    $roleId = $this->ensureSystemRole((int) $agency->id, $type, $now);
                    $this->ensureCapabilities($roleId, $catalog->valuesFor($type), $now);

                    $table = $type->profileTable();
                    if ($table !== null) {
                        DB::table($table)
                            ->where('agency_id', $agency->id)
                            ->whereNull('agency_role_id')
                            ->update(['agency_role_id' => $roleId]);
                    }
                }
            }
        });

        $this->assertNoOrphanProfile();
    }

    public function down(): void
    {
        // Ordre imposé par la FK `restrictOnDelete` : on détache d'abord,
        // on supprime les rôles ensuite. L'inverse échoue en base.
        foreach (AgencyRoleBaseType::assignableTypes() as $type) {
            $table = $type->profileTable();
            if ($table !== null) {
                DB::table($table)->update(['agency_role_id' => null]);
            }
        }

        $systemRoleIds = DB::table('agency_roles')->where('is_system', true)->pluck('id');
        DB::table('agency_role_capabilities')->whereIn('agency_role_id', $systemRoleIds)->delete();
        DB::table('agency_roles')->whereIn('id', $systemRoleIds)->delete();
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
     * Garde-fou : la migration suivante passe la colonne NOT NULL. Un profil
     * resté orphelin y ferait échouer le déploiement au mieux, et casserait
     * l'autorisation de son utilisateur en silence au pire. On préfère un
     * échec ici, avec le compte exact.
     */
    private function assertNoOrphanProfile(): void
    {
        foreach (AgencyRoleBaseType::assignableTypes() as $type) {
            $table = $type->profileTable();
            if ($table === null) {
                continue;
            }

            $orphans = DB::table($table)->whereNull('agency_role_id')->count();
            if ($orphans > 0) {
                throw new RuntimeException(
                    "TCK-279 backfill: {$orphans} ligne(s) de `{$table}` sans `agency_role_id`. ".
                    'Migration interrompue avant le passage NOT NULL.'
                );
            }
        }
    }
};
