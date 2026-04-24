<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Support\Str;
use Laravel\Socialite\Contracts\User as SocialiteUser;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Provider-agnostic OAuth user provisioning. Resolves an existing User by
 * {provider}_id, refuses to auto-link when only the email collides, and
 * otherwise creates a new User with an appropriate email-verified state.
 *
 * Used by Google (TCK-060), Facebook and Apple (TCK-081). Extended per
 * provider via the $markEmailVerified flag and the optional
 * $explicitName override (Apple returns the name only on first consent).
 */
class OAuthProvisioningService
{
    /**
     * Supported providers. The column `{provider}_id` MUST exist on
     * `users` for each entry.
     *
     * @var list<string>
     */
    public const SUPPORTED_PROVIDERS = ['google', 'facebook', 'apple'];

    /**
     * @param  string  $provider  One of {@see self::SUPPORTED_PROVIDERS}.
     * @param  bool  $markEmailVerified  When false, a freshly-created user
     *                                   is left unverified and the `Registered` event is dispatched to
     *                                   trigger the standard verification email (Facebook flow).
     * @param  array{first_name?: ?string, last_name?: ?string}|null  $explicitName
     *                                                                               Pre-parsed name components. Used by Apple which delivers a
     *                                                                               structured `user[name][firstName|lastName]` payload only on
     *                                                                               the very first consent. When the returned SocialiteUser's
     *                                                                               `getName()` is null/empty and no explicit name is provided,
     *                                                                               both columns stay null rather than being forced to empty
     *                                                                               strings — so the profile step can prompt the user later
     *                                                                               without us pretending Apple told us their name.
     */
    public function provision(
        string $provider,
        SocialiteUser $socialUser,
        bool $markEmailVerified = true,
        ?array $explicitName = null,
    ): User {
        if (! in_array($provider, self::SUPPORTED_PROVIDERS, true)) {
            throw new \InvalidArgumentException("Unsupported OAuth provider: {$provider}");
        }

        $providerIdColumn = $provider.'_id';
        $providerId = $socialUser->getId();

        // 1. Trusted path: returning user already linked to this provider id.
        $user = User::where($providerIdColumn, $providerId)->first();
        if ($user !== null) {
            return $user;
        }

        // 2. Email collision: an account with the same email exists but was
        //    never linked to this provider. We refuse to auto-link to prevent
        //    account takeover when a provider returns an unverified or
        //    attacker-controlled email.
        $email = $socialUser->getEmail();
        if ($email !== null && User::where('email', $email)->exists()) {
            throw new HttpException(
                409,
                'Un compte existe déjà avec cette adresse email. Connectez-vous avec votre mot de passe puis liez votre compte depuis vos paramètres.'
            );
        }

        // 3. Truly new user: create and (optionally) mark email as verified.
        [$firstName, $lastName] = $this->resolveName($socialUser, $explicitName);

        // DB schema requires NOT-NULL first_name/last_name. When the
        // provider tells us nothing (Apple "no name after first consent",
        // Facebook without public_profile scope), we store empty strings
        // and let the onboarding flow prompt the user to complete them.
        $attributes = [
            'first_name' => $firstName ?? '',
            'last_name' => $lastName ?? '',
            'email' => $email,
            'type' => 'individual',
            $providerIdColumn => $providerId,
            'password' => bcrypt(Str::random(32)),
        ];

        $user = User::create($attributes);

        if ($markEmailVerified) {
            $user->forceFill(['email_verified_at' => now()])->save();
        } else {
            // Unverified flow (e.g. Facebook): dispatch Registered so the
            // existing verification listener sends the email.
            event(new Registered($user));
        }

        return $user;
    }

    /**
     * @param  array{first_name?: ?string, last_name?: ?string}|null  $explicitName
     * @return array{0: ?string, 1: ?string}
     */
    private function resolveName(SocialiteUser $socialUser, ?array $explicitName): array
    {
        // Apple first-consent override wins when provided.
        if (is_array($explicitName)) {
            $first = $explicitName['first_name'] ?? null;
            $last = $explicitName['last_name'] ?? null;
            if ($first !== null || $last !== null) {
                return [$first, $last];
            }
        }

        $fullName = trim((string) $socialUser->getName());
        if ($fullName === '') {
            return [null, null];
        }

        $firstName = Str::beforeLast($fullName, ' ') ?: $fullName;
        $lastName = Str::contains($fullName, ' ') ? Str::afterLast($fullName, ' ') : null;

        return [$firstName, $lastName];
    }
}
