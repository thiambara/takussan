<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhoneVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verify_fails_without_a_matching_otp_in_cache(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])
            ->assertStatus(422);

        $this->assertNull($user->fresh()->phone_verified_at);
    }

    public function test_verify_with_cached_code_marks_phone_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $service = app(PhoneVerificationService::class);
        $code = $service->sendOtp($user);
        $this->assertNotNull($code);

        $this->postJson('/api/auth/verify-phone', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('data.verified', true);

        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_verify_requires_six_digit_code(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '12'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    public function test_verify_fails_if_phone_already_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])->assertStatus(422);
    }

    public function test_send_otp_returns_debug_code_outside_production(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/phone/send-otp')
            ->assertOk();

        $this->assertTrue($response->json('data.sent'));
        $this->assertMatchesRegularExpression('/^\d{6}$/', $response->json('data.debug_code'));
    }

    public function test_send_otp_enforces_cooldown(): void
    {
        Cache::flush();
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/send-otp')->assertOk();
        $this->postJson('/api/auth/phone/send-otp')->assertStatus(429);
    }

    public function test_resend_fails_if_no_phone_on_file(): void
    {
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/resend')->assertStatus(422);
    }

    public function test_resend_fails_if_phone_already_verified(): void
    {
        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/resend')->assertStatus(422);
    }

    public function test_both_endpoints_require_auth(): void
    {
        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])->assertUnauthorized();
        $this->postJson('/api/auth/phone/resend')->assertUnauthorized();
        $this->postJson('/api/auth/phone/send-otp')->assertUnauthorized();
        $this->postJson('/api/auth/phone/verify-otp', ['code' => '123456'])->assertUnauthorized();
    }
}
