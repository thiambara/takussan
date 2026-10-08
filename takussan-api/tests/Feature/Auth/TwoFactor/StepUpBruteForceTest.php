<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m2 — le step-up ne se force pas : au bout de
 * {@see TwoFactorController::STEP_UP_MAX_FAILURES} échecs, le JETON qui essaie est révoqué.
 * Le compte, lui, n'est pas verrouillé : un verrou de plus serait offert au voleur du jeton,
 * contre le titulaire.
 *
 * Rouge sur fc5c5584 : 5 essais par minute, sans fin (sonde du vérificateur : 30 échecs,
 * `metadata` nulle, puis le bon code → 200).
 */
class StepUpBruteForceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);

        $this->admin = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
    }

    public function test_le_dixieme_echec_revoque_le_jeton_sans_verrouiller_le_compte(): void
    {
        $vole = $this->jeton();
        $titulaire = $this->jeton();

        for ($i = 1; $i < TwoFactorController::STEP_UP_MAX_FAILURES; $i++) {
            $this->faux($vole)->assertStatus(422)->assertJsonPath('code', 'two_factor_step_up_invalid');
        }
        $this->faux($vole)->assertStatus(401)->assertJsonPath('code', 'two_factor_step_up_revoked');

        $this->assertNull(PersonalAccessToken::findToken($vole));
        $this->appel($vole)->getJson('/api/auth/me')->assertUnauthorized();
        $this->bon($vole)->assertUnauthorized();

        // Le compte n'est pas verrouillé : l'autre session du titulaire passe son step-up.
        $this->assertNull(data_get($this->admin->fresh()->metadata, 'locked_at'));
        $this->bon($titulaire)->assertOk();
    }

    public function test_un_step_up_reussi_remet_le_compteur_a_zero(): void
    {
        $jeton = $this->jeton();

        for ($i = 1; $i < TwoFactorController::STEP_UP_MAX_FAILURES; $i++) {
            $this->faux($jeton)->assertStatus(422);
        }
        $this->bon($jeton)->assertOk();
        $this->faux($jeton)->assertStatus(422)->assertJsonPath('code', 'two_factor_step_up_invalid');

        $this->assertNotNull(PersonalAccessToken::findToken($jeton));
    }

    private function jeton(): string
    {
        return app(SessionTokenIssuer::class)->issue($this->admin, 'test')['token'];
    }

    private function faux(string $jeton): TestResponse
    {
        return $this->appel($jeton)->postJson('/api/auth/two-factor/step-up', ['code' => '000000']);
    }

    private function bon(string $jeton): TestResponse
    {
        Cache::forget("totp-last:{$this->admin->id}");

        return $this->appel($jeton)->postJson('/api/auth/two-factor/step-up', [
            'code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET),
        ]);
    }

    private function appel(string $jeton): self
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($jeton);
    }
}
