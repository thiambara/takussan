<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class AuthLoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_login_updates_last_login_at(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $this->assertNotNull($user->fresh()->last_login_at);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'wrongpassword',
        ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'These credentials do not match our records.']);
    }

    public function test_login_failure_is_localized_from_accept_language(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        $response = $this
            ->withHeaders(['Accept-Language' => 'fr'])
            ->postJson('/api/auth/login', [
                'email' => $user->email,
                'password' => 'wrongpassword',
            ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'Ces identifiants ne correspondent pas.']);
    }

    public function test_login_fails_with_unknown_email(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(401);
    }

    public function test_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/auth/logout');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Logged out successfully.']);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_logout_clears_active_profile_cookie(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/auth/logout');

        $response->assertStatus(200);
        $cookie = collect($response->headers->getCookies())
            ->firstWhere(fn ($c) => $c->getName() === 'active_profile_id');
        $this->assertNotNull($cookie, 'logout must Set-Cookie active_profile_id (expired)');
        $this->assertLessThanOrEqual(time(), $cookie->getExpiresTime(), 'cookie must be expired');
    }

    public function test_logout_requires_authentication(): void
    {
        $response = $this->postJson('/api/auth/logout');

        $response->assertStatus(401);
    }

    public function test_login_is_rate_limited_after_five_attempts(): void
    {
        $user = User::factory()->create(['password' => bcrypt('password123')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => $user->email,
                'password' => 'wrongpassword',
            ]);
        }

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'wrongpassword',
        ]);

        $response->assertStatus(429);
    }

    public function test_login_with_two_factor_requires_challenge(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'password' => bcrypt('password123'),
            'two_factor_enabled' => true,
            'two_factor_secret' => $secret,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertOk();

        $response->assertJsonPath('requires_2fa', true);
        $response->assertJsonMissing(['token']);
    }

    public function test_login_with_valid_two_factor_code_returns_token(): void
    {
        $secret = (new Google2FA)->generateSecretKey();
        $user = User::factory()->create([
            'password' => bcrypt('password123'),
            'two_factor_enabled' => true,
            'two_factor_secret' => $secret,
        ]);

        $code = (new Google2FA)->getCurrentOtp($secret);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'two_factor_code' => $code,
        ])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_login_with_invalid_two_factor_code_is_rejected(): void
    {
        $user = User::factory()->create([
            'password' => bcrypt('password123'),
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'two_factor_code' => '000000',
        ])->assertStatus(401);
    }

    public function test_login_with_recovery_code_consumes_it(): void
    {
        $user = User::factory()->create([
            'password' => bcrypt('password123'),
            'two_factor_enabled' => true,
            'two_factor_secret' => (new Google2FA)->generateSecretKey(),
            'two_factor_recovery_codes' => json_encode(['AAAAA-BBBBB', 'CCCCC-DDDDD']),
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'recovery_code' => 'AAAAA-BBBBB',
        ])
            ->assertOk()
            ->assertJsonStructure(['token']);

        // The code is now consumed — second attempt with the same recovery fails.
        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
            'recovery_code' => 'AAAAA-BBBBB',
        ])->assertStatus(401);
    }
}
