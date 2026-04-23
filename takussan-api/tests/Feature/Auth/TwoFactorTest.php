<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Services\Auth\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private function currentCode(string $secret): string
    {
        return (new Google2FA)->getCurrentOtp($secret);
    }

    public function test_enable_returns_secret_and_qr_url(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/enable')
            ->assertOk()
            ->assertJsonStructure(['data' => ['secret', 'qr_url']]);

        $fresh = $user->fresh();
        $this->assertFalse($fresh->two_factor_enabled);
        $this->assertNotNull($fresh->two_factor_secret);
    }

    public function test_enable_fails_if_already_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => true]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/enable')->assertStatus(422);
    }

    public function test_confirm_activates_two_factor_and_returns_recovery_codes(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => $secret,
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/two-factor/confirm', [
            'code' => $this->currentCode($secret),
        ])->assertOk();

        $response->assertJsonPath('data.enabled', true);
        $response->assertJsonStructure(['data' => ['enabled', 'recovery_codes']]);
        $this->assertCount(8, $response->json('data.recovery_codes'));

        $this->assertTrue($user->fresh()->two_factor_enabled);
    }

    public function test_confirm_rejects_invalid_code(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => $secret,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '000000'])
            ->assertStatus(422);

        $this->assertFalse($user->fresh()->two_factor_enabled);
    }

    public function test_confirm_requires_six_digit_code(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '12'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    public function test_confirm_fails_if_already_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => true]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])
            ->assertStatus(422);
    }

    public function test_confirm_fails_without_secret(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false, 'two_factor_secret' => null]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])
            ->assertStatus(422);
    }

    public function test_disable_with_password_deactivates_two_factor(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
            'password' => bcrypt('secret123'),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'secret123'])
            ->assertOk()
            ->assertJsonPath('data.disabled', true);

        $fresh = $user->fresh();
        $this->assertFalse($fresh->two_factor_enabled);
        $this->assertNull($fresh->two_factor_secret);
    }

    public function test_disable_with_totp_code_deactivates_two_factor(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => $secret,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/disable', [
            'code' => $this->currentCode($secret),
        ])->assertOk()->assertJsonPath('data.disabled', true);

        $this->assertFalse($user->fresh()->two_factor_enabled);
    }

    public function test_disable_fails_if_not_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false, 'password' => bcrypt('secret123')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'secret123'])
            ->assertStatus(422);
    }

    public function test_disable_requires_correct_password(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => true, 'password' => bcrypt('secret123')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/disable', ['password' => 'wrongpassword'])
            ->assertStatus(422);
    }

    public function test_recovery_codes_returned_when_enabled(): void
    {
        $codes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
            'two_factor_recovery_codes' => json_encode($codes),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/two-factor/recovery-codes')
            ->assertOk()
            ->assertJsonPath('data.recovery_codes', $codes);
    }

    public function test_regenerate_recovery_codes_returns_fresh_batch(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
            'two_factor_recovery_codes' => json_encode(['OLD11-CODE1']),
        ]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/auth/two-factor/recovery-codes/regenerate')
            ->assertOk();

        $codes = $response->json('data.recovery_codes');
        $this->assertCount(8, $codes);
        $this->assertNotContains('OLD11-CODE1', $codes);
    }

    public function test_recovery_codes_fails_if_not_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false]);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/two-factor/recovery-codes')->assertStatus(422);
    }

    public function test_recovery_code_consumes_on_use(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB', 'CCCCC-DDDDD']),
        ]);

        $service = app(TwoFactorService::class);
        $this->assertTrue($service->verifyRecoveryCode($user, 'AAAAA-BBBBB'));
        $this->assertFalse($service->verifyRecoveryCode($user, 'AAAAA-BBBBB'));
        $this->assertTrue($service->verifyRecoveryCode($user, 'CCCCC-DDDDD'));
    }

    public function test_all_endpoints_require_auth(): void
    {
        $this->postJson('/api/auth/two-factor/enable')->assertUnauthorized();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])->assertUnauthorized();
        $this->postJson('/api/auth/two-factor/disable', ['password' => 'x'])->assertUnauthorized();
        $this->getJson('/api/auth/two-factor/recovery-codes')->assertUnauthorized();
        $this->postJson('/api/auth/two-factor/recovery-codes/regenerate')->assertUnauthorized();
    }
}
