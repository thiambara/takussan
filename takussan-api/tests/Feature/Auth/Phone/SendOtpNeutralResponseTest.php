<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m4 (décision du porteur) — `send-otp` vers un numéro qu'un
 * AUTRE compte a vérifié rend la même réponse qu'un envoi réel, délai de renvoi compris,
 * SANS envoi ni écriture. Le refus ferme (409 `phone.taken`) reste à la vérification.
 *
 * Rouge sur 89ccdce2 : `409 phone_taken` contre `200` — un oracle des numéros inscrits,
 * trois fois par minute, pour tout compte.
 */
class SendOtpNeutralResponseTest extends TestCase
{
    use RefreshDatabase;

    private const PRIS = '+221770000901';

    private const LIBRE = '+221770000902';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        User::factory()->create(['phone' => self::PRIS, 'phone_verified_at' => now()]);
    }

    public function test_un_numero_pris_rend_la_reponse_d_un_envoi_reel_sans_envoi_ni_ecriture(): void
    {
        $reel = $this->envoyer(User::factory()->create(['phone' => null]), self::LIBRE);
        $neutre = $this->envoyer($b = User::factory()->create(['phone' => null]), self::PRIS);

        $this->assertSame(200, $reel->status());
        $this->assertSame($reel->status(), $neutre->status());
        $this->assertSame($reel->json(), $neutre->json());

        $this->assertCount(1, $this->sms->sentTo(self::LIBRE));
        $this->assertSame([], $this->sms->sentTo(self::PRIS));
        $this->assertNull($b->fresh()->phone);
    }

    public function test_le_numero_deja_saisi_et_pris_ailleurs_rend_aussi_la_reponse_neutre(): void
    {
        $b = User::factory()->create(['phone' => self::PRIS, 'phone_verified_at' => null]);

        $this->envoyer($b, null)->assertOk()->assertExactJson(['data' => ['sent' => true]]);
        $this->assertSame([], $this->sms->sentTo(self::PRIS));
    }

    public function test_le_delai_de_renvoi_se_comporte_comme_pour_un_envoi_reel(): void
    {
        $reel = User::factory()->create(['phone' => null]);
        $neutre = User::factory()->create(['phone' => null]);

        $this->envoyer($reel, self::LIBRE)->assertOk();
        $this->envoyer($neutre, self::PRIS)->assertOk();

        $secondReel = $this->envoyer($reel, self::LIBRE);
        $secondNeutre = $this->envoyer($neutre, self::PRIS);
        $this->assertSame(429, $secondReel->status());
        $this->assertSame($secondReel->status(), $secondNeutre->status());
        $this->assertSame($secondReel->json('code'), $secondNeutre->json('code'));
    }

    private function envoyer(User $user, ?string $numero): TestResponse
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);

        return $this->postJson('/api/auth/phone/send-otp', $numero === null ? [] : ['phone' => $numero]);
    }
}
