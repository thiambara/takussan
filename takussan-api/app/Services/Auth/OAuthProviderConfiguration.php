<?php

namespace App\Services\Auth;

final class OAuthProviderConfiguration
{
    /** @var array<string, list<string>> */
    private const REQUIRED_KEYS = [
        'google' => ['client_id', 'client_secret', 'redirect'],
        'facebook' => ['client_id', 'client_secret', 'redirect'],
        'apple' => ['client_id', 'team_id', 'key_id', 'redirect'],
    ];

    /**
     * @return array<int, array{provider: string, configured: bool, missing: list<string>}>
     */
    public function all(): array
    {
        return array_map(
            fn (string $provider): array => [
                'provider' => $provider,
                'configured' => $this->isConfigured($provider),
                'missing' => $this->missing($provider),
            ],
            array_keys(self::REQUIRED_KEYS),
        );
    }

    public function isConfigured(string $provider): bool
    {
        return array_key_exists($provider, self::REQUIRED_KEYS)
            && $this->missing($provider) === [];
    }

    /**
     * @return list<string>
     */
    public function missing(string $provider): array
    {
        $required = self::REQUIRED_KEYS[$provider] ?? null;
        if ($required === null) {
            return ['provider'];
        }

        $missing = [];
        foreach ($required as $key) {
            if (! $this->hasUsableValue(config("services.{$provider}.{$key}"))) {
                $missing[] = $key;
            }
        }

        return $missing;
    }

    private function hasUsableValue(mixed $value): bool
    {
        if (! is_string($value)) {
            return false;
        }

        $value = trim($value);
        if ($value === '') {
            return false;
        }

        return ! preg_match('/^(your[-_].*|change-?me|placeholder|xxx+|todo)$/i', $value);
    }
}
