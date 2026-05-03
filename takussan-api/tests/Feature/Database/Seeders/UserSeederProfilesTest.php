<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class UserSeederProfilesTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_seeder_creates_one_profile_per_non_admin_user(): void
    {
        // Boot a minimal SeedingContext with one real agency so UserSeeder
        // walks its full per-agency persona pipeline (admin + 4 agents +
        // 10 owners + 5 providers).
        (new RolesAndPermissionsSeeder)->run();
        $agency = Agency::factory()->create();

        $context = new SeedingContext;
        $context->agencies = new Collection([$agency]);
        app()->instance(SeedingContext::class, $context);

        $seeder = app(UserSeeder::class);
        $seeder->run();

        // After TCK-142, "users at this agency" is exactly the union of users
        // holding any profile (owner/agent/service_provider) at that agency.
        $ownerUsers = User::query()
            ->whereHas('ownerProfiles', fn ($q) => $q->where('agency_id', $agency->id))
            ->get();
        $agentUsers = User::query()
            ->whereHas('agentProfiles', fn ($q) => $q->where('agency_id', $agency->id))
            ->get();

        $this->assertSame(4, $agentUsers->count());
        $this->assertSame(10, $ownerUsers->count());

        // Profile counts mirror the seeded populations exactly.
        $this->assertSame(10, OwnerProfile::query()->count());
        $this->assertSame(4, AgentProfile::query()->count());
        $this->assertSame(5, ServiceProviderProfile::query()->count());

        // Agency admin has no agency-scoped profile (their authority is
        // entirely role-based) — only one such admin user is created per
        // agency by the seeder.
        $admin = User::query()
            ->whereHas('roles', fn ($q) => $q->where('name', 'agency_admin'))
            ->first();
        $this->assertNotNull($admin);
        $this->assertSame(0, OwnerProfile::query()->where('user_id', $admin->id)->count());
        $this->assertSame(0, AgentProfile::query()->where('user_id', $admin->id)->count());
    }
}
