<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class AuthRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_with_valid_data(): void
    {
        Event::fake();

        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'user'])
            ->assertJsonMissingPath('token');

        $this->assertDatabaseHas('users', ['email' => 'amine@example.com']);
        Event::assertDispatched(Registered::class);
    }

    public function test_registration_fails_with_duplicate_email(): void
    {
        User::factory()->create(['email' => 'amine@example.com']);

        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_registration_fails_with_weak_password(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    public function test_registration_fails_with_missing_fields(): void
    {
        $response = $this->postJson('/api/auth/register', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name', 'email', 'password']);
    }

    public function test_registration_fails_when_password_confirmation_does_not_match(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'different456',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }
}
