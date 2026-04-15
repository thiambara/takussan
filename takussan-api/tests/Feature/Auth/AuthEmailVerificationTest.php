<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthEmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_verify_email_with_valid_signed_url(): void
    {
        $user = User::factory()->unverified()->create();
        $token = $user->createToken('test')->plainTextToken;

        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $user->id, 'hash' => sha1($user->email)]
        );

        // Extract path from URL for the request
        $path = parse_url($verificationUrl, PHP_URL_PATH).'?'.parse_url($verificationUrl, PHP_URL_QUERY);

        $response = $this->withToken($token)->getJson($path);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Email verified successfully.']);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_verification_fails_with_invalid_signature(): void
    {
        $user = User::factory()->unverified()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->getJson("/api/auth/verify-email/{$user->id}/invalidsignature");

        $response->assertStatus(403);
    }

    public function test_already_verified_user_gets_success_message(): void
    {
        $user = User::factory()->create(); // verified by default in factory
        $token = $user->createToken('test')->plainTextToken;

        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $user->id, 'hash' => sha1($user->email)]
        );

        $path = parse_url($verificationUrl, PHP_URL_PATH).'?'.parse_url($verificationUrl, PHP_URL_QUERY);

        $response = $this->withToken($token)->getJson($path);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Email already verified.']);
    }

    public function test_user_can_resend_verification_email(): void
    {
        Notification::fake();

        $user = User::factory()->unverified()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/auth/email/resend');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Verification email resent.']);

        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_resend_fails_if_email_already_verified(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)
            ->postJson('/api/auth/email/resend');

        $response->assertStatus(422);
    }
}
