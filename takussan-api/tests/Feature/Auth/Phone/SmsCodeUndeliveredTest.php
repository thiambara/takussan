<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use App\Services\Notifications\Sms\PhoneNumber;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * P15.05 (TCK-783) — quand aucun fournisseur n'accepte le SMS, l'envoi d'un code le dit : 503
 * `phone.sms_undelivered`, au lieu d'un « code envoyé » qui n'arrivera jamais.
 *
 * Rouge avant correctif : `PhoneVerificationService::issue()` rendait `true` après `deliver()`,
 * quelle qu'en soit l'issue, et les trois routes répondaient 200 `sent: true`.
 *
 * Ce qui ne change pas, et que ce test épingle aussi :
 *  - la connexion par téléphone reste muette (202), son contrat étant de ne rien dire de l'issue ;
 *  - hors production, aperçu allumé (ADR-0060), le code rendu dans la réponse suffit : l'envoi
 *    n'échoue pas, sans quoi la préproduction ne vérifierait plus aucun numéro sans fournisseur.
 */
class SmsCodeUndeliveredTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000783';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->withoutMiddleware(ThrottleRequests::class);
        config(['auth.otp_preview.enabled' => false]);
        $this->app->instance(SmsRouterDriver::class, new class extends FakeSmsRouter
        {
            public function send(array|string $to, string $message, array $context = []): array
            {
                $results = [];
                foreach ((array) $to as $recipient) {
                    $number = PhoneNumber::normalize($recipient);
                    $results[$number] = SmsResult::failed($number, 'fake', 'provider_down');
                }

                return $results;
            }
        });
    }

    public function test_la_verification_du_numero_dit_que_le_sms_n_est_pas_parti(): void
    {
        Sanctum::actingAs(User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]));

        $this->postJson('/api/auth/phone/send-otp')
            ->assertStatus(503)
            ->assertJsonPath('code', 'phone.sms_undelivered')
            ->assertJsonPath('message', __('errors.phone.sms_undelivered'))
            ->assertJsonMissingPath('data.sent');
    }

    public function test_le_second_numero_dit_que_le_sms_n_est_pas_parti(): void
    {
        Sanctum::actingAs(User::factory()->create(['phone' => '+221770000784', 'phone_verified_at' => now()]));

        $this->postJson('/api/auth/secondary-phone/send-otp', ['phone' => self::NUMERO])
            ->assertStatus(503)
            ->assertJsonPath('code', 'phone.sms_undelivered');
    }

    public function test_la_preuve_de_changement_de_numero_dit_que_le_sms_n_est_pas_parti(): void
    {
        Sanctum::actingAs(User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]));

        $this->postJson('/api/auth/phone/change-code')
            ->assertStatus(503)
            ->assertJsonPath('code', 'phone.sms_undelivered');
    }

    public function test_la_connexion_par_telephone_reste_muette(): void
    {
        config(['auth.phone_login.enabled' => true]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
    }

    public function test_avec_l_apercu_du_code_l_envoi_reste_un_succes(): void
    {
        config(['auth.otp_preview.enabled' => true]);
        Sanctum::actingAs(User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]));

        $this->postJson('/api/auth/phone/send-otp')
            ->assertOk()
            ->assertJsonPath('data.sent', true)
            ->assertJsonStructure(['otp_preview']);
    }
}
