<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Auth\OAuthProvisioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

/**
 * Shared OAuth redirect/callback plumbing used by the Facebook and Apple
 * controllers (TCK-081). Each subclass declares its provider string and
 * overrides the two hook methods that carry provider-specific behaviour
 * (email-verified flag, name extraction, driver preparation).
 */
abstract class AbstractOAuthController extends Controller
{
    public function __construct(protected readonly OAuthProvisioningService $provisioning) {}

    /**
     * Socialite driver name (e.g. "facebook", "apple"). MUST be one of
     * OAuthProvisioningService::SUPPORTED_PROVIDERS.
     */
    abstract protected function provider(): string;

    /**
     * Extra preparation of the Socialite driver before issuing the
     * redirect (e.g. Apple JWT client_secret injection).
     */
    protected function prepareDriver(): void {}

    /**
     * Whether freshly-created users should be flagged as email-verified.
     * Override per-provider: Apple → true, Facebook → false.
     */
    abstract protected function markEmailVerified(): bool;

    /**
     * Optionally extract an explicit first_name/last_name pair from the
     * incoming callback request. Used by Apple's first-consent payload.
     *
     * @return array{first_name?: ?string, last_name?: ?string}|null
     */
    protected function explicitName(Request $request): ?array
    {
        return null;
    }

    public function redirect(): JsonResponse
    {
        $this->prepareDriver();

        $state = Str::random(40);
        Cache::put(
            'oauth_state:'.$state,
            ['provider' => $this->provider()],
            now()->addMinutes(10),
        );

        $url = Socialite::driver($this->provider())
            ->stateless()
            ->with(['state' => $state])
            ->redirect()
            ->getTargetUrl();

        return $this->json(['data' => ['redirect_url' => $url]]);
    }

    public function callback(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        $cached = Cache::pull('oauth_state:'.$request->input('state'));
        abort_unless(
            $cached && ($cached['provider'] ?? null) === $this->provider(),
            422,
            'Invalid or expired OAuth state.',
        );

        $this->prepareDriver();

        $socialUser = Socialite::driver($this->provider())->stateless()->user();

        $user = $this->provisioning->provision(
            $this->provider(),
            $socialUser,
            markEmailVerified: $this->markEmailVerified(),
            explicitName: $this->explicitName($request),
        );

        $this->maybeUpdateName($user, $request);

        $token = $user->createToken($this->provider().'-oauth')->plainTextToken;

        return $this->json(['data' => [
            'token' => $token,
            'user' => (new UserResource($user))->toArray($request),
        ]]);
    }

    /**
     * For an existing account, Apple may deliver a first-time-consent
     * `user[name]` blob we should consume only if the stored record has
     * no name yet — never overwrite what the user already provided.
     */
    private function maybeUpdateName(User $user, Request $request): void
    {
        $explicit = $this->explicitName($request);
        if ($explicit === null) {
            return;
        }

        $updates = [];
        $first = $explicit['first_name'] ?? null;
        $last = $explicit['last_name'] ?? null;

        if ($first !== null && $first !== '' && ($user->first_name === null || $user->first_name === '')) {
            $updates['first_name'] = $first;
        }
        if ($last !== null && $last !== '' && ($user->last_name === null || $user->last_name === '')) {
            $updates['last_name'] = $last;
        }

        if ($updates !== []) {
            $user->update($updates);
        }
    }
}
