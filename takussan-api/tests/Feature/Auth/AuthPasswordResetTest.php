<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_forgot_password_sends_reset_email(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        $response = $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ]);

        $response->assertStatus(200);
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_forgot_password_returns_200_for_unknown_email(): void
    {
        $response = $this->postJson('/api/auth/forgot-password', [
            'email' => 'unknown@example.com',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('message', 'If an account with that email exists, a password reset link has been sent.');
    }

    public function test_user_can_reset_password_with_valid_token(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        // Request a reset link to get a valid token
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);

        // Extract the token from the notification
        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $response = $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(200);
        $this->assertTrue(Hash::check('newpassword123', $user->fresh()->password));
    }

    public function test_reset_password_fails_with_invalid_token(): void
    {
        $user = User::factory()->create();

        $response = $this->postJson('/api/auth/reset-password', [
            'token' => 'invalid-token',
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(422);
    }

    public function test_reset_password_revokes_all_tokens(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $user->createToken('existing_token');

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email]);

        $token = null;
        Notification::assertSentTo($user, ResetPassword::class, function ($notification) use (&$token) {
            $token = $notification->token;

            return true;
        });

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $user->email,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
