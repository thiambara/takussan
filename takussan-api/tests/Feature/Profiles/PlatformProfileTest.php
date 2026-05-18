<?php

namespace Tests\Feature\Profiles;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * TCK-278 — invariants du modèle PlatformProfile :
 * unicité 1:1 avec User, scope active, observer qui invalide les tokens
 * Sanctum quand `revoked_at` est posé.
 */
class PlatformProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_with_factory_defaults(): void
    {
        $profile = PlatformProfile::factory()->create();

        $this->assertNotNull($profile->id);
        $this->assertSame(PlatformProfileLevel::Viewer, $profile->level);
        $this->assertNull($profile->revoked_at);
        $this->assertTrue($profile->isActive());
    }

    public function test_super_admin_state(): void
    {
        $profile = PlatformProfile::factory()->superAdmin()->create();

        $this->assertSame(PlatformProfileLevel::SuperAdmin, $profile->level);
    }

    public function test_active_scope_excludes_revoked(): void
    {
        PlatformProfile::factory()->create(); // active
        PlatformProfile::factory()->revoked()->create();

        $this->assertSame(1, PlatformProfile::query()->active()->count());
        $this->assertSame(2, PlatformProfile::query()->count());
    }

    public function test_unique_user_id_at_database_level(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->create(['user_id' => $user->id]);

        $this->expectException(QueryException::class);
        PlatformProfile::factory()->create(['user_id' => $user->id]);
    }

    public function test_observer_deletes_sanctum_tokens_on_revoke(): void
    {
        $user = User::factory()->create();
        $profile = PlatformProfile::factory()->superAdmin()->create(['user_id' => $user->id]);

        $user->createToken('test-token');
        $this->assertSame(1, PersonalAccessToken::query()->where('tokenable_id', $user->id)->count());

        $profile->revoked_at = now();
        $profile->save();

        $this->assertSame(0, PersonalAccessToken::query()->where('tokenable_id', $user->id)->count());
    }

    public function test_observer_noop_when_other_fields_change(): void
    {
        $user = User::factory()->create();
        $profile = PlatformProfile::factory()->superAdmin()->create(['user_id' => $user->id]);
        $user->createToken('test-token');

        $profile->notes = 'audit note';
        $profile->save();

        $this->assertSame(1, PersonalAccessToken::query()->where('tokenable_id', $user->id)->count());
    }
}
