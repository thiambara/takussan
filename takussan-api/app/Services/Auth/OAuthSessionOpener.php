<?php

namespace App\Services\Auth;

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Security\TwoFactorSession;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * TCK-589, vérification adverse B2 — ouvre la session d'un rappel OAuth.
 *
 * Le fournisseur prouve l'identité, jamais le second facteur : un compte à 2FA qui entrait
 * par Google recevait un jeton sans saisir son TOTP, et ce jeton ouvrait la console. Pour un
 * tel compte, le rappel ne rend donc PAS de jeton mais un défi :
 *  - un secret aléatoire, haché en cache, lié au compte, valable 5 minutes ;
 *  - à usage unique (`pull` au succès), oublié après 5 seconds facteurs faux ;
 *  - soldé par `POST /auth/oauth/2fa` avec un TOTP ou un code de secours, le même défi que
 *    `login` : l'échec compte contre le verrou du compte, et le jeton naît avec
 *    `two_factor_verified_at` ({@see TwoFactorSession}).
 */
final class OAuthSessionOpener
{
    private const TTL_MINUTES = 5;

    private const MAX_ATTEMPTS = 5;

    public function __construct(
        private readonly SessionTokenIssuer $tokens,
        private readonly TwoFactorService $twoFactor,
        private readonly LoginLock $lock,
        private readonly CacheRepository $cache,
    ) {}

    public function open(User $user, string $tokenName, Request $request): JsonResponse
    {
        if (! $user->canOpenSession()) {
            return AuthRefusal::response(403, 'account_blocked', 'auth.account.blocked');
        }

        if (! $user->two_factor_enabled) {
            return $this->issue($user, $tokenName, false, $request);
        }

        $challenge = Str::random(64);
        $expiresAt = now()->addMinutes(self::TTL_MINUTES);
        $this->cache->put($this->key($challenge), [
            'user_id' => $user->getKey(),
            'token_name' => $tokenName,
            'attempts' => 0,
            'expires_at' => $expiresAt->getTimestamp(),
        ], $expiresAt);

        return new JsonResponse(['data' => [
            'requires_2fa' => true,
            'challenge' => $challenge,
            'message' => __('auth.two_factor_required'),
        ]]);
    }

    /**
     * @param  array{two_factor_code?: ?string, recovery_code?: ?string}  $proof
     */
    public function complete(string $challenge, array $proof, Request $request): JsonResponse
    {
        $key = $this->key($challenge);
        $pending = $this->cache->get($key);
        $user = is_array($pending) ? User::query()->find($pending['user_id']) : null;
        if ($user === null) {
            return AuthRefusal::response(422, 'oauth_challenge_invalid', 'auth.oauth.challenge_invalid');
        }

        if ($this->lock->isLocked($user)) {
            return AuthRefusal::response(423, 'account_locked', 'auth.account.locked');
        }

        if (! $this->secondFactorHolds($user, $proof)) {
            $this->lock->recordFailure($user);
            $attempts = (int) $pending['attempts'] + 1;
            $attempts >= self::MAX_ATTEMPTS
                ? $this->cache->forget($key)
                : $this->cache->put($key, ['attempts' => $attempts] + $pending, now()->setTimestamp((int) $pending['expires_at']));

            return new JsonResponse(['requires_2fa' => true, 'message' => __('auth.two_factor_invalid')], 401);
        }

        // Usage unique : deux soumissions concurrentes ne retirent le défi qu'une fois.
        if ($this->cache->pull($key) === null) {
            return AuthRefusal::response(422, 'oauth_challenge_invalid', 'auth.oauth.challenge_invalid');
        }

        $this->lock->clear($user);

        return $this->issue($user, (string) $pending['token_name'], true, $request);
    }

    private function issue(User $user, string $tokenName, bool $twoFactorJustVerified, Request $request): JsonResponse
    {
        // Émis par le seul émetteur : borné, et refusé (403 `account_blocked`) à un compte
        // bloqué entre le rappel et le défi.
        $issued = $this->tokens->issue($user, $tokenName, twoFactorJustVerified: $twoFactorJustVerified);

        return new JsonResponse(['data' => [
            'token' => $issued['token'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            'user' => (new UserResource($user))->toArray($request),
        ]]);
    }

    /** @param  array{two_factor_code?: ?string, recovery_code?: ?string}  $proof */
    private function secondFactorHolds(User $user, array $proof): bool
    {
        if (! empty($proof['two_factor_code'])
            && $this->twoFactor->verifyCodeForUser($user, (string) $user->two_factor_secret, (string) $proof['two_factor_code'])) {
            return true;
        }

        return ! empty($proof['recovery_code']) && $this->twoFactor->verifyRecoveryCode($user, (string) $proof['recovery_code']);
    }

    private function key(string $challenge): string
    {
        return 'oauth_2fa:'.hash('sha256', $challenge);
    }
}
