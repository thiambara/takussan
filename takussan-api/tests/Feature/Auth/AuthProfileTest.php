<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_get_own_profile(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me');

        $response->assertStatus(200)
            ->assertJsonFragment([
                'email' => $user->email,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
            ]);
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $response = $this->getJson('/api/auth/me');

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_update_profile(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => 'Updated',
            'last_name' => 'Name',
            'bio' => 'My updated bio.',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment([
                'first_name' => 'Updated',
                'last_name' => 'Name',
            ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'first_name' => 'Updated',
            'last_name' => 'Name',
        ]);
    }

    public function test_profile_update_requires_authentication(): void
    {
        $response = $this->putJson('/api/auth/profile', [
            'first_name' => 'Updated',
            'last_name' => 'Name',
        ]);

        $response->assertStatus(401);
    }

    public function test_profile_update_validates_required_fields(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name']);
    }

    public function test_hidden_fields_are_not_returned(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me');

        $response->assertStatus(200);
        $data = $response->json();

        $this->assertArrayNotHasKey('password', $data);
        $this->assertArrayNotHasKey('remember_token', $data);
        $this->assertArrayNotHasKey('two_factor_secret', $data);
        $this->assertArrayNotHasKey('two_factor_recovery_codes', $data);
    }

    public function test_profile_update_accepts_valid_e164_phone(): void
    {
        $user = User::factory()->create(['phone' => null, 'phone_verified_at' => null]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '+221770000000',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment(['phone' => '+221770000000']);
    }

    public function test_profile_update_rejects_non_e164_phone(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '0770000000',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_changing_phone_resets_phone_verified_at(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '+221780000000',
        ]);

        $response->assertStatus(200)
            ->assertJsonFragment([
                'phone' => '+221780000000',
                'phone_verified_at' => null,
            ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'phone' => '+221780000000',
            'phone_verified_at' => null,
        ]);
    }

    public function test_keeping_phone_unchanged_keeps_verification_intact(): void
    {
        $verifiedAt = now()->subDay();
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => $verifiedAt,
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => 'Same',
            'last_name' => 'Name',
            'phone' => '+221770000000',
        ]);

        $response->assertStatus(200);
        $this->assertNotNull($user->fresh()->phone_verified_at);
    }

    public function test_clearing_phone_with_empty_string_sets_null(): void
    {
        $user = User::factory()->create([
            'phone' => '+221770000000',
            'phone_verified_at' => now(),
        ]);
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->putJson('/api/auth/profile', [
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'phone' => '',
        ]);

        $response->assertStatus(200);
        $fresh = $user->fresh();
        $this->assertNull($fresh->phone);
        $this->assertNull($fresh->phone_verified_at);
    }
}
