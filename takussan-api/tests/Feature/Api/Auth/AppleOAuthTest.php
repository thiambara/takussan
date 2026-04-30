<?php

namespace Tests\Feature\Api\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class AppleOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // No private_key_path → prepareDriver() skips JWT generation (kept
        // under a dedicated assertion in AppleClientSecretGeneratorTest so
        // we can fake Socialite here without touching the filesystem).
        config([
            'services.apple.client_id' => 'com.takussan.test',
            'services.apple.team_id' => 'TEAM123',
            'services.apple.key_id' => 'KEY123',
            'services.apple.private_key_path' => null,
            'services.apple.redirect' => 'http://localhost/api/auth/oauth/apple/callback',
        ]);
    }

    public function test_redirect_returns_apple_url_and_stores_signed_state(): void
    {
        $response = $this->getJson('/api/auth/oauth/apple/redirect');

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $response->json('data.redirect_url');
        $this->assertStringContainsString('appleid.apple.com', $url);
        $this->assertStringContainsString('com.takussan.test', $url);

        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $this->assertArrayHasKey('state', $params);
        $this->assertSame('apple', Cache::get('oauth_state:'.$params['state'])['provider']);
    }

    public function test_callback_first_consent_creates_user_with_name_from_payload(): void
    {
        Cache::put('oauth_state:apple-valid', ['provider' => 'apple'], now()->addMinutes(5));

        // Apple returns the display-name object ONLY on the first consent;
        // Socialite itself doesn't expose it, so our controller parses it
        // out of the raw request (`user[name][firstName|lastName]`).
        $this->mockSocialiteUser('apple-sub-1', 'amine@icloud.com', null);

        $response = $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'apple-valid',
            'user' => json_encode([
                'name' => ['firstName' => 'Amine', 'lastName' => 'Thiam'],
                'email' => 'amine@icloud.com',
            ]),
        ]);

        $response->assertStatus(200);

        $user = User::where('email', 'amine@icloud.com')->firstOrFail();
        $this->assertSame('Amine', $user->first_name);
        $this->assertSame('Thiam', $user->last_name);
        $this->assertSame('apple-sub-1', $user->apple_id);
        $this->assertNotNull($user->email_verified_at, 'Apple asserts email → must be verified.');
    }

    public function test_callback_subsequent_consent_preserves_existing_name(): void
    {
        $existing = User::factory()->create([
            'email' => 'repeat@icloud.com',
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'apple_id' => 'apple-sub-2',
        ]);
        Cache::put('oauth_state:apple-valid', ['provider' => 'apple'], now()->addMinutes(5));

        // No `user` payload — second login with Apple.
        $this->mockSocialiteUser('apple-sub-2', 'repeat@icloud.com', null);

        $response = $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'apple-valid',
        ]);

        $response->assertStatus(200);
        $this->assertSame($existing->id, $response->json('data.user.id'));

        $user = $existing->fresh();
        $this->assertSame('Amine', $user->first_name);
        $this->assertSame('Thiam', $user->last_name);
    }

    public function test_callback_first_consent_on_existing_nameless_user_backfills_name(): void
    {
        // Edge case: a user was created by a previous OAuth provider with
        // no name (e.g. Facebook without public_profile). Apple's first
        // consent now carries the name → we backfill ONLY empty fields.
        $existing = User::factory()->create([
            'email' => 'nameless@icloud.com',
            'first_name' => '',
            'last_name' => '',
            'apple_id' => 'apple-sub-fill',
        ]);
        Cache::put('oauth_state:apple-valid', ['provider' => 'apple'], now()->addMinutes(5));

        $this->mockSocialiteUser('apple-sub-fill', 'nameless@icloud.com', null);

        $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'apple-valid',
            'user' => json_encode([
                'name' => ['firstName' => 'Mo', 'lastName' => 'Diop'],
            ]),
        ])->assertStatus(200);

        $user = $existing->fresh();
        $this->assertSame('Mo', $user->first_name);
        $this->assertSame('Diop', $user->last_name);
    }

    public function test_callback_rejects_email_collision_with_different_apple_account(): void
    {
        User::factory()->create([
            'email' => 'victim@icloud.com',
            'apple_id' => null,
        ]);
        Cache::put('oauth_state:apple-valid', ['provider' => 'apple'], now()->addMinutes(5));

        $this->mockSocialiteUser('apple-attacker', 'victim@icloud.com', null);

        $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'apple-valid',
        ])->assertStatus(409);

        $this->assertDatabaseMissing('users', ['apple_id' => 'apple-attacker']);
    }

    public function test_callback_rejects_invalid_state(): void
    {
        $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'unknown',
        ])->assertStatus(422);
    }

    public function test_callback_rejects_state_bound_to_a_different_provider(): void
    {
        Cache::put('oauth_state:mix', ['provider' => 'facebook'], now()->addMinutes(5));

        $this->postJson('/api/auth/oauth/apple/callback', [
            'code' => 'abc',
            'state' => 'mix',
        ])->assertStatus(422);
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
