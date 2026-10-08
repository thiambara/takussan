<?php

use App\Services\Membership\AgencyRoleCapabilityCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-592 — `maintenance.assign` et `maintenance.close` quittent les rôles SYSTÈME prestataire.
 *
 * Elles y étaient semées par `SystemRoleCapabilities::serviceProvider()`, sans lecteur : accorder la
 * clôture au prestataire contredit P10 (il ne clôt pas seul), et l'assignation est un geste du donneur
 * d'ordre. Le catalogue est vidé dans le même commit ; `membership:reconcile-system-roles` ne
 * supprime jamais une capacité en trop (il la signale) — d'où cette migration de données.
 *
 * Les rôles PERSONNALISÉS ne sont pas touchés : une agence qui a voulu ces capacités pour un rôle de
 * sa création l'a décidé. Elles y restent sans effet côté prestataire (les policies ne les lisent
 * que pour la branche équipe).
 */
return new class extends Migration
{
    private const CAPABILITIES = ['maintenance.assign', 'maintenance.close'];

    public function up(): void
    {
        $roleIds = DB::table('agency_roles')
            ->where('is_system', true)
            ->where('base_profile_type', 'service_provider')
            ->pluck('id');

        DB::table('agency_role_capabilities')
            ->whereIn('capability', self::CAPABILITIES)
            ->whereIn('agency_role_id', $roleIds)
            ->delete();

        // Le résolveur lit les capacités d'un rôle à travers un cache : sans l'oubli, le retrait
        // n'agirait qu'à l'expiration.
        $cache = app(AgencyRoleCapabilityCache::class);
        foreach ($roleIds as $roleId) {
            $cache->forget((int) $roleId);
        }
    }

    public function down(): void
    {
        $now = now();
        $roleIds = DB::table('agency_roles')
            ->where('is_system', true)
            ->where('base_profile_type', 'service_provider')
            ->pluck('id');

        foreach ($roleIds as $roleId) {
            foreach (self::CAPABILITIES as $capability) {
                DB::table('agency_role_capabilities')->insertOrIgnore([
                    'agency_role_id' => $roleId,
                    'capability' => $capability,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }
};
