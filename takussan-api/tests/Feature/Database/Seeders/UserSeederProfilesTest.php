<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\Enums\UserType;
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

        $createdUsers = User::query()
            ->where('agency_id', $agency->id)
            ->get();

        $byType = $createdUsers->groupBy(fn (User $u) => $u->type?->value ?? 'null');

        $admins = $byType->get(UserType::Admin->value, new Collection)->count();
        $agents = $byType->get(UserType::Agent->value, new Collection)->count();
        $individuals = $byType->get(UserType::Individual->value, new Collection)->count();
        $providers = $byType->get(UserType::ServiceProvider->value, new Collection)->count();

        $this->assertSame(1, $admins, 'one agency_admin per agency');
        $this->assertSame(4, $agents);
        $this->assertSame(10, $individuals);
        $this->assertSame(5, $providers);

        // Profile counts mirror the non-admin populations exactly.
        $this->assertSame($individuals, OwnerProfile::query()->count());
        $this->assertSame($agents, AgentProfile::query()->count());
        $this->assertSame($providers, ServiceProviderProfile::query()->count());

        // Admins have no profile of any kind.
        $admin = $byType->get(UserType::Admin->value)->first();
        $this->assertSame(0, OwnerProfile::query()->where('user_id', $admin->id)->count());
        $this->assertSame(0, AgentProfile::query()->where('user_id', $admin->id)->count());
    }
}
