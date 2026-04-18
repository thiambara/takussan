<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_redirect_returns_google_url(): void
    {
        $this->getJson('/api/auth/oauth/google/redirect')
            ->assertOk()
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $this->getJson('/api/auth/oauth/google/redirect')->json('data.redirect_url');
        $this->assertStringContainsString('accounts.google.com', $url);
    }

    public function test_callback_creates_new_user_and_returns_token(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fake-google-access-token',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-uid-123',
                'email' => 'newuser@gmail.com',
                'name' => 'New User',
            ], 200),
        ]);

        $this->getJson('/api/auth/oauth/google/callback?code=valid-code')
            ->assertOk()
            ->assertJsonStructure(['data' => ['token', 'user']]);

        $this->assertDatabaseHas('users', [
            'email' => 'newuser@gmail.com',
            'google_id' => 'google-uid-123',
        ]);
    }

    public function test_callback_links_existing_user_by_email(): void
    {
        $user = User::factory()->create(['email' => 'existing@gmail.com', 'google_id' => null]);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fake-google-access-token',
            ], 200),
            'https://www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'google-uid-456',
                'email' => 'existing@gmail.com',
                'name' => 'Existing User',
            ], 200),
        ]);

        $this->getJson('/api/auth/oauth/google/callback?code=valid-code')
            ->assertOk()
            ->assertJsonPath('data.user.email', 'existing@gmail.com');

        $this->assertEquals('google-uid-456', $user->fresh()->google_id);
    }

    public function test_callback_fails_when_token_exchange_fails(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([], 400),
        ]);

        $this->getJson('/api/auth/oauth/google/callback?code=invalid-code')
            ->assertStatus(422);
    }

    public function test_callback_requires_code(): void
    {
        $this->getJson('/api/auth/oauth/google/callback')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }
}
