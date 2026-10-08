<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Services\Auth\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

/**
 * TCK-589 — contrainte 10 : la 2FA exigée ne se désactive pas, mais « le
 * renouvellement de l'appareil reste possible ». `enable` sur une 2FA active, sous
 * step-up, prépare un nouveau secret ; `confirm` le prouve et remplace l'ancien.
 */
class TwoFactorRenewalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    public function test_un_super_admin_renouvelle_son_appareil_sous_step_up(): void
    {
        $user = $this->actingAsRole('super_admin');
        $ancien = (string) $user->fresh()->two_factor_secret;

        $nouveau = $this->postJson('/api/auth/two-factor/enable')->assertOk()->json('data.secret');
        $this->assertNotSame($ancien, $nouveau);
        // L'ancien secret reste celui du compte tant que le nouveau n'est pas prouvé.
        $this->assertSame($ancien, (string) $user->fresh()->two_factor_secret);
        $this->get('/api/auth/two-factor/qr')->assertOk();

        Cache::forget("totp-last:{$user->id}");
        $this->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp($nouveau)])
            ->assertOk()
            ->assertJsonPath('data.renewed', true);

        $user->refresh();
        $this->assertTrue($user->two_factor_enabled);
        $this->assertSame($nouveau, (string) $user->two_factor_secret);
        $this->assertCount(8, app(TwoFactorService::class)->recoveryCodes($user));
    }

    public function test_sans_secret_en_attente_confirm_refuse(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'two_factor_renewal_missing');
    }

    public function test_un_code_de_l_ancien_appareil_ne_valide_pas_le_nouveau(): void
    {
        $user = $this->actingAsRole('super_admin');
        $this->postJson('/api/auth/two-factor/enable')->assertOk();

        $this->postJson('/api/auth/two-factor/confirm', ['code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET)])
            ->assertStatus(422);
        $this->assertSame(self::TEST_TWO_FACTOR_SECRET, (string) $user->fresh()->two_factor_secret);
    }
}
