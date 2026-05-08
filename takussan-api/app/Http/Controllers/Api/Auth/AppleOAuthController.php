<?php

namespace App\Http\Controllers\Api\Auth;

use App\Services\Auth\AppleClientSecretGenerator;
use App\Services\Auth\OAuthProviderConfiguration;
use App\Services\Auth\OAuthProvisioningService;
use Illuminate\Http\Request;

/**
 * Apple OAuth — TCK-081.
 *
 * - Email is always verified (Apple enforces ownership before issuing
 *   the id_token).
 * - Apple returns a `user[name][firstName|lastName]` payload only on
 *   the very first consent. Subsequent callbacks have no name — we
 *   must not overwrite existing fields with null.
 * - `client_secret` is a JWT signed with the developer's .p8 key; we
 *   inject it into `config('services.apple.client_secret')` right
 *   before Socialite reads it, using the cached 10-min generator.
 */
class AppleOAuthController extends AbstractOAuthController
{
    public function __construct(
        OAuthProvisioningService $provisioning,
        OAuthProviderConfiguration $configuration,
        private readonly AppleClientSecretGenerator $secretGenerator,
    ) {
        parent::__construct($provisioning, $configuration);
    }

    protected function provider(): string
    {
        return 'apple';
    }

    protected function markEmailVerified(): bool
    {
        return true;
    }

    protected function prepareDriver(): void
    {
        // Only generate & inject when configured — tests leave the key
        // path empty and fake Socialite, so skipping here avoids a hard
        // failure on a missing .p8 during unit tests.
        $config = config('services.apple', []);
        $hasKey = ! empty($config['private_key_path']) || ! empty($config['private_key']);
        if (! $hasKey) {
            return;
        }

        config()->set('services.apple.client_secret', $this->secretGenerator->generate());
    }

    /**
     * Apple delivers the name as either a JSON string or an array under
     * the `user` key, e.g. `user[name][firstName]`. Present only on the
     * first consent.
     *
     * @return array{first_name?: ?string, last_name?: ?string}|null
     */
    protected function explicitName(Request $request): ?array
    {
        $raw = $request->input('user');

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : null;
        }

        if (! is_array($raw)) {
            return null;
        }

        $name = $raw['name'] ?? null;
        if (! is_array($name)) {
            return null;
        }

        $first = isset($name['firstName']) ? trim((string) $name['firstName']) : '';
        $last = isset($name['lastName']) ? trim((string) $name['lastName']) : '';

        if ($first === '' && $last === '') {
            return null;
        }

        return [
            'first_name' => $first !== '' ? $first : null,
            'last_name' => $last !== '' ? $last : null,
        ];
    }
}
