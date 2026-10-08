<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-589 AC1 — le code de vérification part VRAIMENT, par `SmsRouterDriver`, vers un
 * numéro non vérifié ; il n'est rendu par aucune réponse.
 *
 * Rouge sur `5f872f1f` : `sendSms()` était un pilote `log-stub` (routeur jamais appelé)
 * et `debug_code` revenait dans la réponse. Ablations rejouées :
 *  - remettre le pilote `log-stub` dans `deliver()` → le faux routeur reçoit 0 appel ;
 *  - envoyer par une notification sur `SmsChannel` → abandon (`phone_verified_at` nul).
 */
class PhoneOtpDeliveryTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_le_code_part_par_le_routeur_sms_vers_un_numero_non_verifie(): void
    {
        $sms = $this->fakeSms();
        $user = User::factory()->create(['phone' => '+221770000001', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/phone/send-otp')->assertOk();

        $this->assertCount(1, $sms->sent, 'un et un seul SMS');
        $envoi = $sms->sent[0];
        $this->assertSame('+221770000001', $envoi['to']);
        $this->assertTrue($envoi['context']['is_critical']);
        $this->assertTrue($envoi['context']['bypass_quiet_hours']);
        $this->assertSame('phone_otp', $envoi['context']['event_type']);
        $code = $sms->lastCodeFor('+221770000001');
        $this->assertArrayNotHasKey('debug_code', $response->json('data'));
        $this->assertStringNotContainsString($code, $response->getContent());

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertOk();
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_le_code_n_est_pas_stocke_en_clair(): void
    {
        $sms = $this->fakeSms();
        $user = User::factory()->create(['phone' => '+221770000001', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp')->assertOk();

        $stocke = Cache::get("phone-otp:{$user->id}");
        $this->assertIsArray($stocke);
        $this->assertStringNotContainsString($sms->lastCodeFor('+221770000001'), json_encode($stocke));
    }

    public function test_l_onboarding_bailleur_recoit_son_code_par_sms_et_le_valide(): void
    {
        $sms = $this->fakeSms();
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'status' => OwnerProfileStatus::Draft->value,
        ]);
        Sanctum::actingAs($user);

        // L'assistant bailleur saisit le numéro et demande le code dans le même geste.
        $response = $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221770000002'])->assertOk();
        $this->assertArrayNotHasKey('debug_code', $response->json('data'));
        $this->assertCount(1, $sms->sentTo('+221770000002'));
        $this->assertTrue($sms->sent[0]['context']['is_critical']);

        $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
            'phone_otp' => ['code' => $sms->lastCodeFor('+221770000002')],
        ])->assertOk();

        $this->assertNotNull($user->fresh()->phone_verified_at);
    }
}
