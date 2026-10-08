<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC2 — l'entrée par téléphone (ADR-0033), drapeau allumé : un numéro
 * inconnu + code valide crée UN compte, le même numéro reconnecte CE compte, la 2FA
 * reste exigée, et un numéro seulement saisi (non vérifié) ne connecte rien.
 *
 * Rouge sur `5f872f1f` : les routes n'existaient pas (404).
 */
class PhoneLoginTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000101';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
    }

    public function test_un_numero_inconnu_cree_un_compte_puis_le_reconnecte(): void
    {
        $premiere = $this->entrer(self::NUMERO)->assertOk()->assertJsonPath('is_new_account', true);

        $user = User::query()->where('phone', self::NUMERO)->sole();
        $this->assertNotNull($user->phone_verified_at);
        $this->assertNull($user->email);
        $this->assertNull($user->password_set_at);
        $this->assertNotEmpty($premiere->json('expires_at'));

        $this->app['auth']->forgetGuards();
        $this->withToken($premiere->json('token'))->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('phone', self::NUMERO);

        $this->travel(61)->seconds();
        $this->app['auth']->forgetGuards();
        $this->entrer(self::NUMERO)
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $user->id);
        $this->assertSame(1, User::query()->where('phone', self::NUMERO)->count());
    }

    public function test_un_compte_a_2fa_recoit_le_defi_puis_entre_avec_le_totp(): void
    {
        $user = User::factory()->create([
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
        $code = $this->sms->lastCodeFor(self::NUMERO);

        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $code])
            ->assertOk()
            ->assertJsonPath('requires_2fa', true)
            ->assertJsonMissingPath('token');

        // Le MÊME code, reposé avec le TOTP.
        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::NUMERO,
            'code' => $code,
            'two_factor_code' => (new Google2FA)->getCurrentOtp(self::TEST_TWO_FACTOR_SECRET),
        ])->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonPath('is_new_account', false);

        // Et le code est désormais consommé.
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $code])
            ->assertStatus(422)
            ->assertJsonPath('code', 'phone_code_invalid');
    }

    public function test_un_totp_faux_ne_connecte_pas(): void
    {
        User::factory()->create([
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO]);

        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::NUMERO,
            'code' => $this->sms->lastCodeFor(self::NUMERO),
            'two_factor_code' => '000000',
        ])->assertUnauthorized()->assertJsonPath('requires_2fa', true)->assertJsonMissingPath('token');
    }

    public function test_un_numero_non_verifie_ne_connecte_pas_le_compte_qui_le_porte(): void
    {
        $ancien = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]);

        $reponse = $this->entrer(self::NUMERO)->assertOk()->assertJsonPath('is_new_account', true);

        $this->assertNotSame($ancien->id, $reponse->json('user.id'));
        $this->assertNull($ancien->fresh()->phone_verified_at);
    }

    public function test_un_code_faux_rend_422(): void
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO]);

        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => '999999'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'phone_code_invalid');
        $this->assertSame(0, User::query()->where('phone', self::NUMERO)->count());
    }

    public function test_un_numero_injoignable_est_refuse(): void
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => '+330612345678'])->assertStatus(422);
        $this->assertSame([], $this->sms->sent);
    }

    private function entrer(string $numero): TestResponse
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(202);

        return $this->postJson('/api/auth/phone/verify-code', [
            'phone' => $numero,
            'code' => $this->sms->lastCodeFor($numero),
        ]);
    }
}
