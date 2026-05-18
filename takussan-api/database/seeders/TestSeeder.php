<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Baseline fixtures for integration tests: one agency with one user per role.
 *
 * Users are keyed by role name in the returned context so callers can do
 * `$seeder->users['agent']` after running.
 *
 * TCK-278 — Le rôle est désormais matérialisé via un profil polymorphe
 * (cf. Règle 5). Le seeder crée le bon profil pour chaque rôle.
 */
class TestSeeder extends Seeder
{
    public Agency $agency;

    /** @var array<string,User> */
    public array $users = [];

    public function run(): void
    {
        $this->agency = Agency::factory()->create();

        $roles = ['super_admin', 'agency_admin', 'agent', 'owner', 'broker', 'service_provider'];
        foreach ($roles as $role) {
            $user = User::factory()->create();
            $this->materializeProfile($user, $role);
            $this->users[$role] = $user;
        }
    }

    private function materializeProfile(User $user, string $role): void
    {
        match ($role) {
            'super_admin' => PlatformProfile::query()->firstOrCreate(
                ['user_id' => $user->id],
                ['level' => PlatformProfileLevel::SuperAdmin, 'granted_at' => now()],
            ),
            'agency_admin' => AgencyAdminProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $this->agency->id],
                ['status' => AgencyAdminProfileStatus::Active->value],
            ),
            'agent' => AgentProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $this->agency->id],
                ['status' => AgentProfileStatus::Active->value],
            ),
            'owner' => OwnerProfile::query()->firstOrCreate(
                ['user_id' => $user->id, 'agency_id' => $this->agency->id],
                ['status' => OwnerProfileStatus::Active->value],
            ),
            'broker' => BrokerProfile::factory()->create(['user_id' => $user->id]),
            'service_provider' => ServiceProviderProfile::query()->firstOrCreate(
                ['user_id' => $user->id],
                ['status' => ServiceProviderProfileStatus::Active->value],
            ),
            default => null,
        };
    }
}
