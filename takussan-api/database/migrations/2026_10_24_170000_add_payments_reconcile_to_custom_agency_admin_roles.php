<?php

use App\Services\Membership\AgencyRoleCapabilityCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2260 (P116.07, ADR-0003, amendement du 2026-10-24) — `payments.reconcile` entre au catalogue,
 * et le rapprochement bancaire l'exige de l'admin (`BankStatementPolicy::viewAny`).
 *
 * Les rôles SYSTÈME la reçoivent par `membership:reconcile-system-roles` (`docker/release.sh`), qui
 * ne voit qu'eux. Un admin dont le profil pointe un rôle PERSONNALISÉ de base `agency_admin` aurait
 * perdu les relevés de son agence au déploiement : cette migration la lui insère, en ajout seul
 * (`insertOrIgnore` sur l'unique `arc_role_capability_unique`), donc rejouable sans effet.
 *
 * Les rôles personnalisés d'un autre type ne sont pas touchés : le rapprochement n'était pas à eux.
 */
return new class extends Migration
{
    private const CAPABILITY = 'payments.reconcile';

    public function up(): void
    {
        $roleIds = $this->customAgencyAdminRoleIds();
        $now = now();

        foreach ($roleIds->chunk(500) as $chunk) {
            DB::table('agency_role_capabilities')->insertOrIgnore($chunk->map(static fn ($roleId): array => [
                'agency_role_id' => $roleId,
                'capability' => self::CAPABILITY,
                'created_at' => $now,
                'updated_at' => $now,
            ])->values()->all());
        }

        $this->forget($roleIds);
    }

    /**
     * La capacité n'existait pas avant cette migration : aucun rôle personnalisé de base
     * `agency_admin` ne pouvait la porter. La retirer d'eux, et d'eux seuls, rend l'état d'avant.
     */
    public function down(): void
    {
        $roleIds = $this->customAgencyAdminRoleIds();

        DB::table('agency_role_capabilities')
            ->where('capability', self::CAPABILITY)
            ->whereIn('agency_role_id', $roleIds)
            ->delete();

        $this->forget($roleIds);
    }

    /** @return Collection<int, int> */
    private function customAgencyAdminRoleIds(): Collection
    {
        return DB::table('agency_roles')
            ->where('is_system', false)
            ->where('base_profile_type', 'agency_admin')
            ->orderBy('id')
            ->pluck('id');
    }

    /**
     * Le résolveur lit les capacités d'un rôle à travers un cache : sans l'oubli, l'ajout n'agirait
     * qu'à l'expiration.
     *
     * @param  Collection<int, int>  $roleIds
     */
    private function forget(Collection $roleIds): void
    {
        $cache = app(AgencyRoleCapabilityCache::class);
        foreach ($roleIds as $roleId) {
            $cache->forget((int) $roleId);
        }
    }
};
