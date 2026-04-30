<?php

namespace App\Services\Notifications\Sms;

use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Contracts\Config\Repository as ConfigRepository;

/**
 * TCK-102 — Cache the Orange OAuth2 client_credentials access token in
 * Redis with TTL `expires_in - safety_margin` so we don't hit
 * `/oauth/v3/token` on every send.
 */
class OrangeOAuthTokenCache
{
    public function __construct(
        private readonly CacheRepository $cache,
        private readonly ConfigRepository $config,
    ) {}

    private function key(int $integrationId): string
    {
        return "sms:orange:oauth_token:{$integrationId}";
    }

    public function get(int $integrationId): ?string
    {
        $token = $this->cache->get($this->key($integrationId));

        return is_string($token) && $token !== '' ? $token : null;
    }

    public function put(int $integrationId, string $token, int $expiresInSeconds): void
    {
        $margin = (int) $this->config->get('sms.orange.oauth_token_safety_margin_seconds', 60);
        $ttl = max(30, $expiresInSeconds - $margin);
        $this->cache->put($this->key($integrationId), $token, $ttl);
    }

    public function forget(int $integrationId): void
    {
        $this->cache->forget($this->key($integrationId));
    }
}
