<?php

namespace Tests;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * TCK-278 — Helper universel pour les tests qui construisent les
     * users manuellement (sans `actingAsRole`). Crée le profil
     * polymorphe qui matérialise le rôle (cf. Règle 5). Idempotent.
     */
    public function materializeRoleProfile(User $user, string $role, ?Agency $agency = null): void
    {
        if ($role === 'super_admin') {
            PlatformProfile::query()->firstOrCreate(
                ['user_id' => $user->id],
                [
                    'level' => PlatformProfileLevel::SuperAdmin,
                    'granted_at' => now(),
                ],
            );

            return;
        }

        $agencyId = $agency?->id ?? $user->agency_id;
        if ($agencyId === null) {
            return;
        }

        match ($role) {
            'agency_admin' => AgencyAdminProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            'agent' => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            'owner' => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $agencyId],
            ),
            default => null,
        };
    }
}
