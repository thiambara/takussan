<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * TCK-589 AC7b — `metadata.force_2fa_reconfigure`, posé par la réinitialisation du
 * support, est enfin LU : 403 `two_factor_required` hors `auth/*`, exposé par
 * `GET /auth/me`, effacé par `two-factor/confirm`.
 *
 * Rouge sur `5f872f1f` : la clé n'était lue nulle part (`app/`, `routes/`, front).
 */
class ForceTwoFactorReconfigureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    public function test_apres_reset_2fa_le_compte_est_ramene_a_l_enrolement(): void
    {
        $cible = User::factory()->create([
            'email' => 'cible@example.com',
            'password' => 'password123',
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/users/{$cible->id}/reset-2fa", ['reason' => 'appareil perdu'])->assertOk();

        // Le compte se reconnecte : la 2FA n'est plus demandée, mais exigée.
        $this->app['auth']->forgetGuards();
        $token = $this->postJson('/api/auth/login', ['email' => 'cible@example.com', 'password' => 'password123'])
            ->assertOk()
            ->json('token');

        $this->avec($token)->getJson('/api/me/profiles')
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');
        $this->avec($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('force_2fa_reconfigure', true);

        $secret = $this->avec($token)->postJson('/api/auth/two-factor/enable')->assertOk()->json('data.secret');
        $this->avec($token)->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)])
            ->assertOk();

        $this->assertArrayNotHasKey('force_2fa_reconfigure', $cible->fresh()->metadata ?? []);
        $this->avec($token)->getJson('/api/me/profiles')->assertOk();
        $this->avec($token)->getJson('/api/auth/me')->assertJsonPath('force_2fa_reconfigure', false);
    }

    private function avec(string $token): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }
}
