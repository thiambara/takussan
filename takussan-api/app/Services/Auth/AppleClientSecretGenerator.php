<?php

namespace App\Services\Auth;

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

/**
 * Generates the Apple "Sign in with Apple" client_secret JWT (ES256-signed
 * with the developer's .p8 private key). Apple tokens are valid up to 6
 * months; we refresh and cache for 10 minutes to keep rotations cheap
 * and bound the blast radius of any accidental key exfiltration.
 *
 * Required `config('services.apple')` keys:
 *   - client_id       : Services ID (e.g. "com.takussan.web")
 *   - team_id         : Apple Developer Team ID (10-char)
 *   - key_id          : Key ID of the .p8 (10-char)
 *   - private_key_path: Absolute path to AuthKey_XXXXXXXXXX.p8
 *
 * Also accepts `private_key` (raw PEM) as an alternative for environments
 * where the key is stored in a secret manager instead of a file.
 */
class AppleClientSecretGenerator
{
    private const CACHE_KEY = 'apple_oauth_client_secret';

    private const CACHE_TTL_SECONDS = 600;

    /**
     * JWT lifetime is 15 minutes — well under Apple's 6-month cap and
     * plenty for a single OAuth round-trip, while bounding replay
     * exposure if a process dump leaks the secret.
     */
    private const JWT_TTL_SECONDS = 900;

    /**
     * Return a signed client_secret JWT, using a cached copy when fresh.
     */
    public function generate(): string
    {
        return Cache::remember(
            self::CACHE_KEY,
            self::CACHE_TTL_SECONDS,
            fn (): string => $this->build()
        );
    }

    /**
     * Force a new JWT, bypassing the cache. Used by tests and by an
     * eventual "rotate now" operator command.
     */
    public function forceRefresh(): string
    {
        Cache::forget(self::CACHE_KEY);

        return $this->generate();
    }

    private function build(): string
    {
        $config = config('services.apple', []);

        $teamId = $config['team_id'] ?? null;
        $keyId = $config['key_id'] ?? null;
        $clientId = $config['client_id'] ?? null;

        foreach (['team_id' => $teamId, 'key_id' => $keyId, 'client_id' => $clientId] as $field => $value) {
            if (empty($value)) {
                throw new RuntimeException("Apple OAuth config is missing `{$field}`. Set APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_CLIENT_ID in .env.");
            }
        }

        $privateKey = $this->resolvePrivateKey($config);
        $now = time();

        $payload = [
            'iss' => $teamId,
            'iat' => $now,
            'exp' => $now + self::JWT_TTL_SECONDS,
            'aud' => 'https://appleid.apple.com',
            'sub' => $clientId,
        ];

        return JWT::encode($payload, $privateKey, 'ES256', $keyId);
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function resolvePrivateKey(array $config): string
    {
        // Prefer `private_key_path` (.p8 file on disk — production default).
        $path = $config['private_key_path'] ?? null;
        if (is_string($path) && $path !== '') {
            if (! is_readable($path)) {
                throw new RuntimeException("Apple private key not readable at path: {$path}");
            }
            $contents = file_get_contents($path);
            if ($contents === false || trim($contents) === '') {
                throw new RuntimeException("Apple private key file is empty: {$path}");
            }

            return $contents;
        }

        // Fall back to a raw PEM string (secret manager / CI).
        $raw = $config['private_key'] ?? null;
        if (is_string($raw) && trim($raw) !== '') {
            return $raw;
        }

        throw new RuntimeException('Apple OAuth: neither `services.apple.private_key_path` nor `services.apple.private_key` is configured.');
    }
}
