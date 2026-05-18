<?php

namespace Tests\Feature\Console;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * TCK-278 — `platform:backfill-from-spatie` :
 * pour chaque user portant le rôle spatie super_admin, crée un
 * PlatformProfile actif si absent. Idempotent et dry-run supporté.
 */
class BackfillPlatformProfilesCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
    }

    public function test_creates_platform_profile_for_spatie_super_admins(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('super_admin');

        $this->artisan('platform:backfill-from-spatie')->assertSuccessful();

        $profile = PlatformProfile::query()->where('user_id', $admin->id)->first();
        $this->assertNotNull($profile);
        $this->assertSame(PlatformProfileLevel::SuperAdmin, $profile->level);
    }

    public function test_idempotent_skips_existing_profile(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('super_admin');
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $admin->id]);

        $this->artisan('platform:backfill-from-spatie')->assertSuccessful();

        $this->assertSame(1, PlatformProfile::query()->where('user_id', $admin->id)->count());
    }

    public function test_dry_run_writes_nothing(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('super_admin');

        $this->artisan('platform:backfill-from-spatie', ['--dry-run' => true])->assertSuccessful();

        $this->assertSame(0, PlatformProfile::query()->where('user_id', $admin->id)->count());
    }

    public function test_ignores_users_without_super_admin_role(): void
    {
        User::factory()->create(); // pas de rôle

        $this->artisan('platform:backfill-from-spatie')->assertSuccessful();

        $this->assertSame(0, PlatformProfile::query()->count());
    }
}
