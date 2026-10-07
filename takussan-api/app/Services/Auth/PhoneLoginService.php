<?php

namespace App\Services\Auth;

use App\Http\Resources\UserResource;
use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * TCK-589 (ADR-0033) — l'entrée par téléphone : un code SMS remplace le mot de
 * passe, jamais le second facteur.
 *
 *  - Le code est rangé par NUMÉRO (portée `login`), sans `User` : la demande rend
 *    la même réponse que le numéro porte un compte ou non (énumération).
 *  - Un numéro ne connecte que le compte qui l'a VÉRIFIÉ (contrainte 2). Sinon le
 *    premier code valide crée un compte neuf — `phone_verified_at` posé par
 *    `markVerified`, mot de passe aléatoire, `password_set_at` nul, e-mail nul —
 *    même si un compte non vérifié porte ce numéro : aucune fusion.
 *  - Verrou : celui du compte (`LoginLock`, partagé avec le mot de passe) ; pour un
 *    numéro sans compte, le même compteur en cache. Lu AVANT le code : le bon code
 *    n'y échappe pas.
 *  - 2FA : le code SMS est d'abord vérifié SANS être consommé, la réponse
 *    `requires_2fa` invite à reposer le même code avec le TOTP.
 *
 * Exposé sans `User` : TCK-596 / TCK-599 réutilisent `sendCodeTo` de
 * {@see PhoneVerificationService} sous leur propre portée.
 */
class PhoneLoginService
{
    public const SCOPE = 'login';

    public function __construct(
        private readonly PhoneVerificationService $codes,
        private readonly LoginLock $lock,
        private readonly TwoFactorService $twoFactor,
        private readonly SessionTokenIssuer $tokens,
    ) {}

    /**
     * Émet un code si rien ne s'y oppose. Ne dit RIEN de l'issue : verrou, délai
     * entre deux envois et compte absent produisent la même réponse en amont.
     */
    public function requestCode(string $phone, ?string $locale): void
    {
        $user = $this->verifiedAccount($phone);
        if ($user !== null ? $this->lock->isLocked($user) : $this->lock->isNumberLocked($phone)) {
            return;
        }

        $this->codes->sendCodeTo(self::SCOPE, $phone, $locale);
    }

    /**
     * @param  array{two_factor_code?: ?string, recovery_code?: ?string, device_name?: ?string}  $proof
     */
    public function verify(string $phone, string $code, array $proof, ?string $locale): JsonResponse
    {
        $user = $this->verifiedAccount($phone);

        if ($user !== null ? $this->lock->isLocked($user) : $this->lock->isNumberLocked($phone)) {
            return AuthRefusal::response(423, 'account_locked', 'auth.account.locked');
        }

        $twoFactorPending = $user !== null && $user->two_factor_enabled
            && empty($proof['two_factor_code']) && empty($proof['recovery_code']);

        if (! $this->codes->verifyCodeFor(self::SCOPE, $phone, $code, consume: ! $twoFactorPending)) {
            $user !== null ? $this->lock->recordFailure($user) : $this->lock->recordNumberFailure($phone);

            return AuthRefusal::response(422, 'phone_code_invalid', 'auth.phone.code_invalid');
        }

        if ($user !== null && ! $user->canOpenSession()) {
            return AuthRefusal::response(403, 'account_blocked', 'auth.account.blocked');
        }

        if ($twoFactorPending) {
            return new JsonResponse(['requires_2fa' => true, 'message' => __('auth.two_factor_required')], 200);
        }

        if ($user !== null && $user->two_factor_enabled && ! $this->secondFactorHolds($user, $proof)) {
            $this->lock->recordFailure($user);

            return new JsonResponse(['requires_2fa' => true, 'message' => __('auth.two_factor_invalid')], 401);
        }

        $isNewAccount = $user === null;
        $user ??= $this->createAccount($phone, $locale);

        $this->lock->clear($user);
        $this->lock->clearNumber($phone);
        $user->forceFill(['last_login_at' => now()])->save();

        $issued = $this->tokens->issue(
            $user,
            (string) ($proof['device_name'] ?? '') ?: 'auth_token',
            twoFactorJustVerified: (bool) $user->two_factor_enabled,
        );

        return new JsonResponse([
            'token' => $issued['token'],
            'expires_at' => $issued['expires_at']->toIso8601String(),
            'user' => new UserResource($user->fresh()),
            'is_new_account' => $isNewAccount,
        ], 200);
    }

    /** Le compte qui a VÉRIFIÉ ce numéro — un numéro seulement saisi ne prouve rien. */
    private function verifiedAccount(string $phone): ?User
    {
        return User::query()->where('phone', $phone)->whereNotNull('phone_verified_at')->first();
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

    private function createAccount(string $phone, ?string $locale): User
    {
        return DB::transaction(function () use ($phone, $locale): User {
            $user = new User;
            $user->forceFill([
                'first_name' => '',
                'last_name' => '',
                'email' => null,
                // Aucun mot de passe connu : la valeur machine fait échouer
                // `Hash::check`, et `password_set_at` nul le dit (TCK-272).
                'password' => Hash::make(Str::random(40)),
                'status' => UserStatus::Active,
                'preferred_language' => $locale ?: config('app.locale'),
            ])->save();

            // Le seul écrivain de `phone_verified_at` (contrainte 5 ter) : le code
            // vient d'arriver sur ce numéro.
            $this->codes->markVerified($user, $phone);

            return $user;
        });
    }
}
