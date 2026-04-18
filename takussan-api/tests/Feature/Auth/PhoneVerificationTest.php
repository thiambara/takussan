<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PhoneVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_verify_marks_phone_as_verified(): void
    {
        $user = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])
            ->assertOk()
            ->assertJsonPath('data.verified', true);

        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_verify_requires_six_digit_code(): void
    {
        $user = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '12'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    public function test_verify_fails_if_phone_already_verified(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/verify-phone', ['code' => '123456'])->assertStatus(422);
    }

    public function test_resend_succeeds_with_phone_on_file(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => null,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/phone/resend')
            ->assertOk()
            ->assertJsonPath('data.sent', true);
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
    }
}
