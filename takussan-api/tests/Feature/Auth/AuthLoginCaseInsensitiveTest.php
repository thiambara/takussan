<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthLoginCaseInsensitiveTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_matches_email_case_insensitively(): void
    {
        User::factory()->create([
            'email' => 'marie.dupont@example.com',
            'password' => bcrypt('password123'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'Marie.Dupont@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_login_matches_all_caps_email(): void
    {
        User::factory()->create([
            'email' => 'jean.dujardin@example.com',
            'password' => bcrypt('password123'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'JEAN.DUJARDIN@EXAMPLE.COM',
            'password' => 'password123',
        ]);

        $response->assertStatus(200);
    }

    public function test_register_rejects_case_variant_duplicate(): void
    {
        User::factory()->create(['email' => 'alice@example.com']);

        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Alice',
            'last_name' => 'Copy',
            'email' => 'ALICE@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_register_normalizes_email_to_lowercase(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Bob',
            'last_name' => 'Marley',
            'email' => '  BOB.MARLEY@Example.COM  ',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(201);

        $user = User::where('email', 'bob.marley@example.com')->first();
        $this->assertNotNull($user);
        $this->assertSame('bob.marley@example.com', $user->email);
    }

    public function test_user_model_mutator_normalizes_email(): void
    {
        $user = User::factory()->create(['email' => '  Pascal.Case@Example.ORG  ']);

        $this->assertSame('pascal.case@example.org', $user->fresh()->email);
    }

    public function test_existing_user_update_normalizes_email(): void
    {
        $user = User::factory()->create(['email' => 'original@example.com']);
        $user->update(['email' => 'UPDATED@EXAMPLE.COM']);

        $this->assertSame('updated@example.com', $user->fresh()->email);
    }
}
