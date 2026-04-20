<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Laravel\Socialite\Facades\Socialite;

class OAuthController extends Controller
{
    private const ALLOWED_PROVIDERS = ['google', 'facebook', 'apple'];

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

        $user = $this->findOrCreateUser($provider, $socialUser);
        $token = $user->createToken($provider.'-oauth')->plainTextToken;

        return $this->json(['data' => [
            'token' => $token,
            'user' => ['id' => $user->id, 'email' => $user->email],
        ]]);
    }

    private function findOrCreateUser(string $provider, SocialiteUser $socialUser): User
    {
        $providerIdColumn = $provider.'_id';

        $user = User::where($providerIdColumn, $socialUser->getId())
            ->orWhere('email', $socialUser->getEmail())
            ->first();

        if ($user === null) {
            $nameParts = explode(' ', (string) $socialUser->getName(), 2);
            $user = User::create([
                'first_name' => $nameParts[0] ?? '',
                'last_name' => $nameParts[1] ?? '',
                'email' => $socialUser->getEmail(),
                $providerIdColumn => $socialUser->getId(),
                'email_verified_at' => now(),
                'password' => bcrypt(Str::random(32)),
            ]);
        } else {
            $user->update([$providerIdColumn => $socialUser->getId()]);
        }

        return $user;
    }
}
