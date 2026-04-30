<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\UserResource;
use App\Services\Auth\OAuthProvisioningService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

/**
 * Generic Google OAuth controller (TCK-060). Facebook and Apple are served
 * by dedicated controllers in App\Http\Controllers\Api\Auth (TCK-081) to
 * isolate provider-specific concerns (Apple JWT client_secret, Facebook
 * "email_verified" unreliability, Apple name-on-first-consent).
 */
class OAuthController extends Controller
{
    // TCK-081 — Facebook and Apple moved to dedicated controllers in
    // App\Http\Controllers\Api\Auth. This controller now serves Google only;
    // keep the guard tight so a route-file mistake can't route an unsupported
    // provider here (callback hardcodes `markEmailVerified: true`, which is
    // incorrect for Facebook's unreliable `email_verified` claim).
    private const ALLOWED_PROVIDERS = ['google'];

    public function __construct(private readonly OAuthProvisioningService $provisioning) {}

    public function redirect(string $provider): JsonResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $state = Str::random(40);
        Cache::put('oauth_state:'.$state, ['provider' => $provider], now()->addMinutes(10));

        $url = Socialite::driver($provider)
            ->stateless()
            ->with(['state' => $state])
            ->redirect()
            ->getTargetUrl();

        return $this->json(['data' => ['redirect_url' => $url]]);
    }

    public function callback(string $provider, Request $request): JsonResponse
    {
        abort_unless(in_array($provider, self::ALLOWED_PROVIDERS, true), 404);

        $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        $cached = Cache::pull('oauth_state:'.$request->input('state'));
        abort_unless($cached && $cached['provider'] === $provider, 422, 'Invalid or expired OAuth state.');

        /** @var SocialiteUser $socialUser */
        $socialUser = Socialite::driver($provider)->stateless()->user();

        // Google asserts email verification via its OIDC contract; mark verified.
        $user = $this->provisioning->provision($provider, $socialUser, markEmailVerified: true);
        $token = $user->createToken($provider.'-oauth')->plainTextToken;

        return $this->json(['data' => [
            'token' => $token,
            'user' => (new UserResource($user))->toArray($request),
        ]]);
    }
}
