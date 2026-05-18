<?php

namespace Tests\Feature\Console;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-278 — `platform:grant-super-admin {email}` :
 * crée/promeut un PlatformProfile super_admin, idempotent, lève
 * `revoked_at`, et accorde aussi le rôle spatie historique pour la
 * coexistence pré-cutover.
 */
class GrantSuperAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // RolesAndPermissionsSeeder crée le rôle spatie super_admin sous
        // team_id = null — pré-requis pour que `assignRole('super_admin')`
        // dans la commande ne lève pas `RoleDoesNotExist`.
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_creates_super_admin_profile_for_existing_user(): void
    {
        $user = User::factory()->create(['email' => 'boss@takussan.test']);

        $this->artisan('platform:grant-super-admin', ['email' => 'boss@takussan.test'])
            ->assertSuccessful();

        $profile = PlatformProfile::query()->where('user_id', $user->id)->first();
        $this->assertNotNull($profile);
        $this->assertSame(PlatformProfileLevel::SuperAdmin, $profile->level);
        $this->assertNull($profile->revoked_at);
    }

    public function test_idempotent_promote_existing_viewer(): void
    {
        $user = User::factory()->create(['email' => 'support@takussan.test']);
        PlatformProfile::factory()->create([
            'user_id' => $user->id,
            'level' => PlatformProfileLevel::Viewer,
        ]);

        $this->artisan('platform:grant-super-admin', ['email' => 'support@takussan.test'])
            ->assertSuccessful();

        $this->assertSame(1, PlatformProfile::query()->where('user_id', $user->id)->count());
        $this->assertSame(
            PlatformProfileLevel::SuperAdmin,
            PlatformProfile::query()->where('user_id', $user->id)->first()->level,
        );
    }

    public function test_unrevokes_previously_revoked_profile(): void
    {
        $user = User::factory()->create(['email' => 'comeback@takussan.test']);
        PlatformProfile::factory()->superAdmin()->revoked()->create(['user_id' => $user->id]);

        $this->artisan('platform:grant-super-admin', ['email' => 'comeback@takussan.test'])
            ->assertSuccessful();

        $profile = PlatformProfile::query()->where('user_id', $user->id)->first();
        $this->assertNull($profile->revoked_at);
    }

    public function test_fails_on_unknown_email(): void
    {
        $this->artisan('platform:grant-super-admin', ['email' => 'ghost@nowhere.test'])
            ->expectsOutputToContain('Aucun user trouvé')
            ->assertFailed();
    }

    public function test_email_is_lowercased(): void
    {
        $user = User::factory()->create(['email' => 'mixed.case@takussan.test']);

        $this->artisan('platform:grant-super-admin', ['email' => 'Mixed.Case@TAKUSSAN.test'])
            ->assertSuccessful();

        $this->assertSame(1, PlatformProfile::query()->where('user_id', $user->id)->count());
    }
}
