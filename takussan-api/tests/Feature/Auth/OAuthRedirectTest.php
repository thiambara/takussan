<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OAuthRedirectTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('providerDataProvider')]
    public function test_redirect_returns_provider_url_and_stores_state(string $provider): void
    {
        $this->configureProvider($provider);

        $response = $this->getJson("/api/auth/oauth/{$provider}/redirect");

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $response->json('data.redirect_url');
        $this->assertStringContainsString(
            $provider === 'apple' ? 'com.takussan.test' : 'test-client-id',
            $url,
        );

        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $this->assertArrayHasKey('state', $params);
        $this->assertNotNull(Cache::get('oauth_state:'.$params['state']));
    }

    public function test_unknown_provider_returns_404(): void
    {
        $this->getJson('/api/auth/oauth/twitter/redirect')->assertStatus(404);
    }

    public function test_provider_index_exposes_only_configured_providers(): void
    {
        $this->configureProvider('google');
        config([
            'services.facebook.client_id' => '',
            'services.facebook.client_secret' => '',
            'services.facebook.redirect' => 'http://localhost/api/auth/oauth/facebook/callback',
            'services.apple.client_id' => 'placeholder',
            'services.apple.team_id' => '',
            'services.apple.key_id' => '',
            'services.apple.redirect' => 'http://localhost/api/auth/oauth/apple/callback',
        ]);

        $response = $this->getJson('/api/auth/oauth/providers');

        $response->assertOk()
            ->assertJsonPath('data.providers.0.provider', 'google')
            ->assertJsonPath('data.providers.0.configured', true)
            ->assertJsonPath('data.providers.1.provider', 'facebook')
            ->assertJsonPath('data.providers.1.configured', false)
            ->assertJsonPath('data.providers.2.provider', 'apple')
            ->assertJsonPath('data.providers.2.configured', false);
    }

    public function test_unconfigured_provider_redirect_returns_422_without_external_redirect(): void
    {
        config([
            'services.facebook.client_id' => '',
            'services.facebook.client_secret' => '',
            'services.facebook.redirect' => 'http://localhost/api/auth/oauth/facebook/callback',
        ]);

        $this->getJson('/api/auth/oauth/facebook/redirect')
            ->assertStatus(422)
            ->assertJsonPath('message', 'OAuth provider is not configured.');
    }

    public static function providerDataProvider(): array
    {
        return [
            'google' => ['google'],
            'facebook' => ['facebook'],
            'apple' => ['apple'],
        ];
    }

    private function configureProvider(string $provider): void
    {
        $config = [
            "services.{$provider}.client_id" => $provider === 'apple' ? 'com.takussan.test' : 'test-client-id',
            "services.{$provider}.redirect" => 'http://localhost/api/auth/oauth/'.$provider.'/callback',
        ];

        if ($provider === 'apple') {
            $config['services.apple.team_id'] = 'TEAM123';
            $config['services.apple.key_id'] = 'KEY123';
        } else {
            $config["services.{$provider}.client_secret"] = 'test-secret';
        }

        config($config);
    }
}
