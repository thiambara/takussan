<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-589 AC1c — cinq codes faux invalident le code : le BON code, présenté ensuite,
 * est refusé. Seul le limiteur de route (`throttle:5,1`, qui se réarme chaque minute
 * pendant les 5 min de vie du code) bornait les essais.
 *
 * Rouge sur `5f872f1f` (200). Ablation : retirer le compteur de `check()` → rouge.
 */
class PhoneOtpAttemptLimitTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    public function test_cinq_codes_faux_invalident_le_code(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+221770000003', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);
        $code = $this->issuePhoneCode($user);
        $faux = $code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            RateLimiter::clear($this->routeThrottleKey($user));
            $this->postJson('/api/auth/phone/verify-otp', ['code' => $faux])->assertStatus(422);
        }

        RateLimiter::clear($this->routeThrottleKey($user));
        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertStatus(422);
        $this->assertNull($user->fresh()->phone_verified_at);
    }

    public function test_quatre_codes_faux_laissent_le_bon_passer(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+221770000003', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);
        $code = $this->issuePhoneCode($user);
        $faux = $code === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 4; $i++) {
            RateLimiter::clear($this->routeThrottleKey($user));
            $this->postJson('/api/auth/phone/verify-otp', ['code' => $faux])->assertStatus(422);
        }

        RateLimiter::clear($this->routeThrottleKey($user));
        $this->postJson('/api/auth/phone/verify-otp', ['code' => $code])->assertOk();
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    /** Clé du `throttle:5,1` anonyme : Laravel la dérive de l'utilisateur authentifié. */
    private function routeThrottleKey(User $user): string
    {
        return sha1((string) $user->getAuthIdentifier());
    }
}
