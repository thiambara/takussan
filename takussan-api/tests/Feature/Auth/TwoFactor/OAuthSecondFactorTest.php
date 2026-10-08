<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse B2 — par OAuth, un compte à 2FA entrait sans TOTP : le rappel
 * émettait un jeton, et la 2FA « exigée » jugeait le COMPTE. Rouge sur `e59cb8b2` : rappel
 * Google d'un super-admin à 2FA → 200 avec jeton, `GET /api/admin/users` → 200.
 *
 * Désormais le rappel rend un défi, le jeton naît de `POST /auth/oauth/2fa`, et la 2FA exigée
 * juge le JETON (`TwoFactorSession`), quel que soit le chemin d'entrée.
 */
class OAuthSecondFactorTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.google.client_id' => 'test-client-id',
            'services.google.client_secret' => 'test-secret',
            'services.google.redirect' => 'http://localhost/api/auth/oauth/google/callback',
            'services.facebook.client_id' => 'fb-test-client',
            'services.facebook.client_secret' => 'fb-test-secret',
            'services.facebook.redirect' => 'http://localhost/api/auth/oauth/facebook/callback',
        ]);
        $this->admin = User::factory()->create([
            'email' => 'sa@example.com',
            'google_id' => 'google-sa',
            'facebook_id' => 'fb-sa',
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB']),
        ]);
        $this->materializeRoleProfile($this->admin, 'super_admin');
    }

    public function test_le_rappel_google_d_un_compte_a_2fa_ne_rend_pas_de_jeton(): void
    {
        $this->rappel('google')
            ->assertOk()
            ->assertJsonPath('data.requires_2fa', true)
            ->assertJsonMissingPath('data.token');

        $this->assertSame(0, $this->admin->tokens()->count());
    }

    public function test_le_rappel_facebook_d_un_compte_a_2fa_ne_rend_pas_de_jeton(): void
    {
        $this->rappel('facebook')
            ->assertOk()
            ->assertJsonPath('data.requires_2fa', true)
            ->assertJsonMissingPath('data.token');

        $this->assertSame(0, $this->admin->tokens()->count());
    }

    public function test_le_defi_reussi_rend_un_jeton_qui_ouvre_la_console(): void
    {
        $defi = $this->rappel('google')->json('data.challenge');

        $jeton = $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'two_factor_code' => $this->totp()])
            ->assertOk()
            ->assertJsonStructure(['data' => ['token', 'expires_at', 'user']])
            ->json('data.token');

        $this->assertNotNull(PersonalAccessToken::findToken($jeton)->two_factor_verified_at);
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/admin/users')->assertOk();
    }

    public function test_le_defi_accepte_un_code_de_secours_et_ne_sert_qu_une_fois(): void
    {
        $defi = $this->rappel('google')->json('data.challenge');

        $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'recovery_code' => 'AAAAA-BBBBB'])->assertOk();
        $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'two_factor_code' => $this->totp()])
            ->assertStatus(422)
            ->assertJsonPath('code', 'oauth_challenge_invalid');
        $this->assertSame(1, $this->admin->tokens()->count());
    }

    public function test_un_second_facteur_faux_ne_rend_pas_de_jeton_et_le_defi_s_epuise(): void
    {
        $defi = $this->rappel('google')->json('data.challenge');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'two_factor_code' => '000000'])
                ->assertStatus(401)
                ->assertJsonPath('requires_2fa', true);
        }
        $this->postJson('/api/auth/oauth/2fa', ['challenge' => $defi, 'two_factor_code' => $this->totp()])
            ->assertStatus(422)
            ->assertJsonPath('code', 'oauth_challenge_invalid');
        $this->assertSame(0, $this->admin->tokens()->count());
    }

    public function test_un_defi_inconnu_est_refuse(): void
    {
        $this->postJson('/api/auth/oauth/2fa', ['challenge' => str_repeat('x', 64), 'two_factor_code' => $this->totp()])
            ->assertStatus(422)
            ->assertJsonPath('code', 'oauth_challenge_invalid');
    }

    public function test_un_jeton_sans_second_facteur_n_ouvre_pas_la_console(): void
    {
        $jeton = $this->admin->createToken('sans-2fa')->plainTextToken;

        $this->withToken($jeton)->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_step_up_required');
        $cible = User::factory()->create();
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->putJson("/api/users/{$cible->id}/role", ['role' => 'super_admin'])
            ->assertForbidden();
        $this->assertFalse($cible->fresh()->isSuperAdmin());

        // Le TOTP saisi sur CE jeton (step-up) le rend à deux facteurs.
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->postJson('/api/auth/two-factor/step-up', ['code' => $this->totp()])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/admin/users')->assertOk();
    }

    public function test_un_jeton_sans_second_facteur_ne_touche_pas_une_action_d_agence(): void
    {
        $agence = Agency::factory()->create(['name' => 'Avant']);
        $admin = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        $jeton = $admin->createToken('sans-2fa')->plainTextToken;

        $this->withToken($jeton)->putJson("/api/agencies/{$agence->id}", ['name' => 'Après'])
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_step_up_required');
        $this->assertSame('Avant', $agence->fresh()->name);
    }

    public function test_l_enrolement_rend_la_session_a_deux_facteurs(): void
    {
        $user = User::factory()->create();
        $jeton = $user->createToken('session')->plainTextToken;
        $secret = $this->withToken($jeton)->postJson('/api/auth/two-factor/enable')->assertOk()->json('data.secret');

        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)])
            ->assertOk();

        $this->assertNotNull(PersonalAccessToken::findToken($jeton)->two_factor_verified_at);
    }

    private function rappel(string $fournisseur)
    {
        Cache::put("oauth_state:{$fournisseur}-ok", ['provider' => $fournisseur], now()->addMinutes(5));
        $social = Mockery::mock(SocialiteUser::class);
        $social->shouldReceive('getId')->andReturn($fournisseur === 'google' ? 'google-sa' : 'fb-sa');
        $social->shouldReceive('getEmail')->andReturn('sa@example.com');
        $social->shouldReceive('getName')->andReturn('Super Admin');
        Socialite::shouldReceive('driver->stateless->user')->andReturn($social);

        return $this->getJson("/api/auth/oauth/{$fournisseur}/callback?code=abc&state={$fournisseur}-ok");
    }

    private function totp(): string
    {
        return (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET);
    }
}
