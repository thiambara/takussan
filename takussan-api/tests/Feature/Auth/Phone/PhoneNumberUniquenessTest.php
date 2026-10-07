<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\Agency;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-589 AC16 — un numéro n'est VÉRIFIÉ que sur un compte (contrainte 5 ter).
 * A l'a vérifié ; B, qui porte le même numéro, ne peut plus le vérifier — ni par le
 * profil ni par l'onboarding bailleur : 409 `phone_taken`, pas 500, pas 200.
 *
 * Rouge sur `5f872f1f` : 200, le numéro finissait vérifié sur les deux comptes.
 * Ablation : sans le test préalable de `markVerified`, l'index partiel
 * `users_phone_verified_unique` lève une violation → 500.
 */
class PhoneNumberUniquenessTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    private const NUMERO = '+221770000501';

    private User $b;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $this->b = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => null]);
    }

    public function test_par_le_profil(): void
    {
        $code = $this->issuePhoneCode($this->b);
        Sanctum::actingAs($this->b);

        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])
            ->assertStatus(409)
            ->assertJsonPath('code', 'phone_taken');

        $this->assertNull($this->b->fresh()->phone_verified_at);
    }

    public function test_le_renvoi_refuse_avant_de_depenser_un_sms(): void
    {
        $sms = $this->fakeSms();
        Sanctum::actingAs($this->b);

        $this->postJson('/api/auth/phone/send-otp')
            ->assertStatus(409)
            ->assertJsonPath('code', 'phone_taken');
        $this->assertSame([], $sms->sent);
    }

    public function test_par_l_onboarding_bailleur(): void
    {
        $owner = OwnerProfile::factory()->create([
            'user_id' => $this->b->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => OwnerProfileStatus::Draft->value,
        ]);
        $code = $this->issuePhoneCode($this->b);
        Sanctum::actingAs($this->b);

        $this->postJson('/api/owner/onboard/complete', [
            'owner_profile_id' => $owner->id,
            'phone_otp' => ['code' => $code],
        ])->assertStatus(409)->assertJsonPath('code', 'phone_taken');

        $this->assertNull($this->b->fresh()->phone_verified_at);
        $this->assertSame(OwnerProfileStatus::Draft, $owner->fresh()->status);
    }
}
