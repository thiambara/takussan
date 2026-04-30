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
        config([
            "services.{$provider}.client_id" => 'test-client-id',
            "services.{$provider}.client_secret" => 'test-secret',
            "services.{$provider}.redirect" => 'http://localhost/api/auth/oauth/'.$provider.'/callback',
        ]);

        $response = $this->getJson("/api/auth/oauth/{$provider}/redirect");

        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['redirect_url']]);

        $url = $response->json('data.redirect_url');
        $this->assertStringContainsString('test-client-id', $url);

        parse_str(parse_url($url, PHP_URL_QUERY) ?? '', $params);
        $this->assertArrayHasKey('state', $params);
        $this->assertNotNull(Cache::get('oauth_state:'.$params['state']));
    }

    public function test_unknown_provider_returns_404(): void
    {
        $this->getJson('/api/auth/oauth/twitter/redirect')->assertStatus(404);
    }

    public static function providerDataProvider(): array
    {
        return [
            'google' => ['google'],
            'facebook' => ['facebook'],
            'apple' => ['apple'],
        ];
    }
}
