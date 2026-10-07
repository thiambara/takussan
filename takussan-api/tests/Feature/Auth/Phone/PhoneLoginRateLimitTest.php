<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Auth\LoginLock;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589 AC3 — les bornes de l'entrée par téléphone (ADR-0033 §6) : 5 échecs
 * invalident le code, 10 échecs consécutifs verrouillent le numéro (423, même avec
 * le bon code) — avec ou sans compte —, et les limiteurs par numéro tiennent quand
 * l'IP change.
 */
class PhoneLoginRateLimitTest extends TestCase
{
    use RefreshDatabase;

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Cache::flush();
        $this->sms = FakeSmsRouter::install();
    }

    public function test_au_sixieme_code_faux_le_code_est_invalide(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $numero = '+221770000401';
        $this->postJson('/api/auth/phone/request-code', ['phone' => $numero]);
        $code = $this->sms->lastCodeFor($numero);

        for ($i = 0; $i < 5; $i++) {
            $this->verifier($numero, '000000')->assertStatus(422);
        }

        $this->verifier($numero, $code)->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');
    }

    /** @return array<string, array{0: bool}> */
    public static function avecOuSansCompte(): array
    {
        return ['compte vérifié' => [true], 'numéro sans compte' => [false]];
    }

    #[DataProvider('avecOuSansCompte')]
    public function test_au_dela_du_seuil_le_numero_est_verrouille_meme_avec_le_bon_code(bool $avecCompte): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $numero = '+221770000402';
        if ($avecCompte) {
            User::factory()->create(['phone' => $numero, 'phone_verified_at' => now()]);
        }

        for ($i = 0; $i < LoginLock::MAX_FAILURES; $i++) {
            $this->verifier($numero, '000000')->assertStatus(422);
        }

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(202);
        // Verrouillé : aucun code n'est même émis…
        $this->assertSame([], $this->sms->sentTo($numero));

        // … et un code valide émis par ailleurs n'y échappe pas.
        app(PhoneVerificationService::class)->sendCodeTo('login', $numero);
        $this->verifier($numero, $this->sms->lastCodeFor($numero))
            ->assertStatus(423)
            ->assertJsonPath('code', 'account_locked');

        // Quinze minutes plus tard, le verrou est levé.
        $this->travel(LoginLock::LOCK_MINUTES)->minutes();
        $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(202);
        $this->verifier($numero, $this->sms->lastCodeFor($numero))->assertOk();
    }

    public function test_le_limiteur_de_verification_par_numero_tient_quand_l_ip_change(): void
    {
        $numero = '+221770000403';

        for ($i = 0; $i < 10; $i++) {
            $this->depuis("10.0.0.{$i}")->postJson('/api/auth/phone/verify-code', ['phone' => $numero, 'code' => '000000'])
                ->assertStatus(422);
        }

        $this->depuis('10.0.1.1')->postJson('/api/auth/phone/verify-code', ['phone' => $numero, 'code' => '000000'])
            ->assertStatus(429);
        // Un autre numéro, lui, n'est pas concerné.
        $this->depuis('10.0.1.1')->postJson('/api/auth/phone/verify-code', ['phone' => '+221770000404', 'code' => '000000'])
            ->assertStatus(422);
    }

    public function test_le_limiteur_d_envoi_par_numero_tient_quand_l_ip_change(): void
    {
        $numero = '+221770000405';

        for ($i = 0; $i < 3; $i++) {
            $this->travel(61)->seconds();
            $this->depuis("10.0.2.{$i}")->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(202);
        }

        $this->travel(61)->seconds();
        $this->depuis('10.0.3.1')->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(429);
        $this->assertCount(3, $this->sms->sentTo($numero));
    }

    private function verifier(string $numero, string $code): TestResponse
    {
        return $this->postJson('/api/auth/phone/verify-code', ['phone' => $numero, 'code' => $code]);
    }

    private function depuis(string $ip): self
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip]);
    }
}
