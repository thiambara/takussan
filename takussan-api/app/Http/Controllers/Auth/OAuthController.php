<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
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
            'user' => (new UserResource($user))->toArray($request),
        ]]);
    }

    private function findOrCreateUser(string $provider, SocialiteUser $socialUser): User
    {
        $providerIdColumn = $provider.'_id';

        // 1. Trusted path: returning user already linked to this provider id.
        $user = User::where($providerIdColumn, $socialUser->getId())->first();
        if ($user !== null) {
            return $user;
        }

        // 2. Email collision: an account with the same email exists but was never linked
        //    to this provider. We refuse to auto-link to prevent account takeover when
        //    a provider returns an unverified or attacker-controlled email.
        $email = $socialUser->getEmail();
        if ($email !== null && User::where('email', $email)->exists()) {
            abort(409, 'Un compte existe déjà avec cette adresse email. Connectez-vous avec votre mot de passe puis liez votre compte depuis vos paramètres.');
        }

        // 3. Truly new user: create and mark email as verified (OAuth provider owns it).
        $fullName = (string) $socialUser->getName();
        $firstName = Str::beforeLast($fullName, ' ') ?: $fullName;
        $lastName = Str::contains($fullName, ' ') ? Str::afterLast($fullName, ' ') : '';
        $user = User::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'type' => 'individual',
            $providerIdColumn => $socialUser->getId(),
            'password' => bcrypt(Str::random(32)),
        ]);
        $user->forceFill(['email_verified_at' => now()])->save();

        event(new Registered($user));

        return $user;
    }
}
