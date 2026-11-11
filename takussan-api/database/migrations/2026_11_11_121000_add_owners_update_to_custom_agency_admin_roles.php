<?php

use App\Services\Membership\AgencyRoleCapabilityCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2640 — `owners.update` entre au catalogue : régler le plafond de travaux d'un bailleur du
 * carnet (`PATCH /api/owners/{id}`, `OwnerProfilePolicy::update`).
 *
 * Les rôles SYSTÈME la reçoivent par `membership:reconcile-system-roles` (`docker/release.sh`), qui
 * ne voit qu'eux. Un admin dont le profil pointe un rôle PERSONNALISÉ de base `agency_admin` ne
 * l'aurait jamais : cette migration la lui insère, en ajout seul (`insertOrIgnore` sur l'unique
 * `arc_role_capability_unique`), donc rejouable sans effet. Même forme que `2026_10_24_170000`.
 *
 * Les rôles personnalisés d'un autre type ne sont pas touchés : le geste est nouveau, personne ne
 * le tenait.
 */
return new class extends Migration
{
    private const CAPABILITY = 'owners.update';

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
