<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class OAuthCallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_callback_creates_new_user_and_returns_token(): void
    {
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));

        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-123');
        $socialUser->shouldReceive('getEmail')->andReturn('new@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Amine Thiam');

        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $response = $this->getJson('/api/auth/oauth/google/callback?code=abc&state=valid');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email']]]);

        $this->assertDatabaseHas('users', [
            'email' => 'new@example.com',
            'google_id' => 'google-123',
        ]);
    }

    public function test_callback_links_existing_user_by_email(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com', 'google_id' => null]);
        Cache::put('oauth_state:valid', ['provider' => 'google'], now()->addMinutes(5));

        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn('google-456');
        $socialUser->shouldReceive('getEmail')->andReturn('existing@example.com');
        $socialUser->shouldReceive('getName')->andReturn('Whatever');

        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);

        $this->getJson('/api/auth/oauth/google/callback?code=abc&state=valid')->assertStatus(200);

        $this->assertSame('google-456', $user->fresh()->google_id);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_callback_rejects_invalid_state(): void
    {
        $this->getJson('/api/auth/oauth/google/callback?code=abc&state=unknown')
            ->assertStatus(422);
    }

    public function test_callback_rejects_state_for_wrong_provider(): void
    {
        Cache::put('oauth_state:mix', ['provider' => 'google'], now()->addMinutes(5));

        $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=mix')
            ->assertStatus(422);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
