<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * TCK-589 AC11 — le step-up : un TOTP de moins de 10 min, porté PAR LE JETON
 * (contrainte 9), exigé pour l'impersonation et la lecture des codes de secours.
 *
 * Rouge sur `5f872f1f` : une session volée impersonnait et lisait les codes de
 * secours sans jamais revoir le TOTP.
 */
class StepUpTwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $cible;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->admin = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB']),
        ]);
        $this->materializeRoleProfile($this->admin, 'super_admin');
        $this->cible = User::factory()->create();
    }

    public function test_sans_step_up_les_deux_actions_rendent_403(): void
    {
        $jeton = $this->jeton();

        $this->impersonate($jeton)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->codesDeSecours($jeton)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
    }

    public function test_le_step_up_ouvre_les_actions_sur_le_meme_jeton_pendant_dix_minutes(): void
    {
        $jeton = $this->jeton();
        $autre = $this->jeton();

        $this->stepUp($jeton)->assertOk()->assertJsonStructure(['data' => ['valid_until']]);

        $this->impersonate($jeton)->assertOk();
        $this->codesDeSecours($jeton)->assertOk()->assertJsonPath('data.recovery_codes', ['AAAAA-BBBBB']);

        // Une autre session du même compte ne l'hérite pas.
        $this->impersonate($autre)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->codesDeSecours($autre)->assertForbidden();

        $this->travel(10)->minutes();
        $this->travel(1)->seconds();
        $this->impersonate($jeton)->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
        $this->codesDeSecours($jeton)->assertForbidden();
    }

    public function test_un_code_faux_ne_pose_pas_de_step_up(): void
    {
        $jeton = $this->jeton();

        $this->appel($jeton)->postJson('/api/auth/two-factor/step-up', ['code' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_step_up_invalid');
        $this->impersonate($jeton)->assertForbidden();
    }

    public function test_le_jeton_factice_de_sanctum_acting_as_ne_vaut_pas_step_up(): void
    {
        Sanctum::actingAs($this->admin);

        $this->postJson("/api/admin/users/{$this->cible->id}/impersonate")
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_step_up_required');
    }

    public function test_la_connexion_par_totp_vaut_step_up(): void
    {
        $this->admin->forceFill(['email' => 'admin@example.com', 'password' => 'password123'])->save();
        $jeton = $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password123',
            'two_factor_code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET),
        ])->assertOk()->json('token');

        $this->impersonate($jeton)->assertOk();
    }

    private function jeton(): string
    {
        return app(SessionTokenIssuer::class)->issue($this->admin, 'test')['token'];
    }

    private function stepUp(string $jeton): TestResponse
    {
        Cache::forget("totp-last:{$this->admin->id}");

        return $this->appel($jeton)->postJson('/api/auth/two-factor/step-up', [
            'code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET),
        ]);
    }

    private function impersonate(string $jeton): TestResponse
    {
        return $this->appel($jeton)->postJson("/api/admin/users/{$this->cible->id}/impersonate");
    }

    private function codesDeSecours(string $jeton): TestResponse
    {
        return $this->appel($jeton)->getJson('/api/auth/two-factor/recovery-codes');
    }

    private function appel(string $jeton): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($jeton);
    }
}
