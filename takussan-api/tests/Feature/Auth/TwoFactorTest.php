<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TwoFactorTest extends TestCase
{
    use RefreshDatabase;

    public function test_enable_returns_secret_and_qr_url(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/enable')
            ->assertOk()
            ->assertJsonStructure(['data' => ['secret', 'qr_url']]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'two_factor_enabled' => false,
        ]);
        $this->assertNotNull($user->fresh()->two_factor_secret);
    }

    public function test_enable_fails_if_already_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => true]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/enable')->assertStatus(422);
    }

    public function test_confirm_activates_two_factor(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => 'SOMESECRET12345678901234567890AB',
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])
            ->assertOk()
            ->assertJsonPath('data.enabled', true);

        $this->assertTrue($user->fresh()->two_factor_enabled);
    }

    public function test_confirm_requires_six_digit_code(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => false,
            'two_factor_secret' => 'SOMESECRET12345678901234567890AB',
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

    public function test_disable_deactivates_two_factor(): void
    {
        $user = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => 'SOMESECRET12345678901234567890AB',
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
            'two_factor_secret' => 'SOMESECRET12345678901234567890AB',
            'two_factor_recovery_codes' => json_encode($codes),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/two-factor/recovery-codes')
            ->assertOk()
            ->assertJsonPath('data.recovery_codes', $codes);
    }

    public function test_recovery_codes_fails_if_not_enabled(): void
    {
        $user = User::factory()->create(['two_factor_enabled' => false]);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/two-factor/recovery-codes')->assertStatus(422);
    }

    public function test_all_endpoints_require_auth(): void
    {
        $this->postJson('/api/auth/two-factor/enable')->assertUnauthorized();
        $this->postJson('/api/auth/two-factor/confirm', ['code' => '123456'])->assertUnauthorized();
        $this->postJson('/api/auth/two-factor/disable', ['password' => 'x'])->assertUnauthorized();
        $this->getJson('/api/auth/two-factor/recovery-codes')->assertUnauthorized();
    }
}
