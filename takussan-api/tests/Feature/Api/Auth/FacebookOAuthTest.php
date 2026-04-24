<?php

namespace Tests\Feature\Api\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class FacebookOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.facebook.client_id' => 'fb-test-client',
            'services.facebook.client_secret' => 'fb-test-secret',
            'services.facebook.redirect' => 'http://localhost/api/auth/oauth/facebook/callback',
        ]);
    }

    public function test_redirect_returns_facebook_url_and_stores_signed_state(): void
    {
        $response = $this->getJson('/api/auth/oauth/facebook/redirect');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $response->json('data.redirect_url');
        $this->assertStringContainsString('facebook.com', $url);
        $this->assertStringContainsString('fb-test-client', $url);

        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $this->assertArrayHasKey('state', $params);
        $this->assertNotNull(Cache::get('oauth_state:'.$params['state']));
        $this->assertSame('facebook', Cache::get('oauth_state:'.$params['state'])['provider']);
    }

    public function test_callback_creates_user_and_leaves_email_unverified(): void
    {
        Event::fake([Registered::class]);
        Cache::put('oauth_state:fb-valid', ['provider' => 'facebook'], now()->addMinutes(5));

        $this->mockSocialiteUser('fb-123', 'newbie@example.com', 'John Doe');

        $response = $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=fb-valid');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'email']]]);

        $this->assertDatabaseHas('users', [
            'email' => 'newbie@example.com',
            'facebook_id' => 'fb-123',
        ]);

        // Facebook email_verified is unreliable → we must NOT mark as verified,
        // and we MUST dispatch Registered so the verification email is sent.
        $user = User::where('email', 'newbie@example.com')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        Event::assertDispatched(Registered::class);
    }

    public function test_callback_returns_existing_user_linked_by_facebook_id(): void
    {
        $user = User::factory()->create([
            'email' => 'old@example.com',
            'facebook_id' => 'fb-789',
        ]);
        Cache::put('oauth_state:fb-valid', ['provider' => 'facebook'], now()->addMinutes(5));

        $this->mockSocialiteUser('fb-789', 'old@example.com', 'Whatever');

        $response = $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=fb-valid');

        $response->assertStatus(200);
        $this->assertSame($user->id, $response->json('data.user.id'));
        $this->assertDatabaseCount('users', 1);
    }

    public function test_callback_rejects_email_collision_with_different_facebook_account(): void
    {
        User::factory()->create([
            'email' => 'victim@example.com',
            'facebook_id' => null,
        ]);
        Cache::put('oauth_state:fb-valid', ['provider' => 'facebook'], now()->addMinutes(5));

        $this->mockSocialiteUser('fb-attacker', 'victim@example.com', 'Attacker');

        $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=fb-valid')
            ->assertStatus(409);

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseMissing('users', ['facebook_id' => 'fb-attacker']);
    }

    public function test_callback_rejects_invalid_state(): void
    {
        $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=unknown')
            ->assertStatus(422);
    }

    public function test_callback_rejects_state_bound_to_a_different_provider(): void
    {
        // A valid Google state cannot be replayed against Facebook.
        Cache::put('oauth_state:mix', ['provider' => 'google'], now()->addMinutes(5));

        $this->getJson('/api/auth/oauth/facebook/callback?code=abc&state=mix')
            ->assertStatus(422);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function mockSocialiteUser(string $id, ?string $email, ?string $name): void
    {
        $socialUser = Mockery::mock(SocialiteUser::class);
        $socialUser->shouldReceive('getId')->andReturn($id);
        $socialUser->shouldReceive('getEmail')->andReturn($email);
        $socialUser->shouldReceive('getName')->andReturn($name);

        Socialite::shouldReceive('driver->stateless->user')->andReturn($socialUser);
    }
}
