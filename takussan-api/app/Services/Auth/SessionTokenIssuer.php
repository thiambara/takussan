<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-589 — le SEUL émetteur des jetons de session (mot de passe, inscription,
 * téléphone, OAuth). Chaque jeton naît borné :
 *  - `expires_at` : durée absolue (30 j ; super-admin `platform.session_max_minutes`,
 *    lu ICI, à l'émission — c'est le lecteur que ce réglage n'avait pas) ;
 *  - `idle_timeout_minutes` : inactivité tolérée (7 j ; super-admin 30 min), jugée
 *    par {@see AccessTokenGate} à chaque requête ;
 *  - `two_factor_verified_at` : posé quand un TOTP vient d'être saisi pour obtenir
 *    ce jeton — il vaut step-up pendant 10 min, pour CE jeton seulement.
 *
 * Un compte qui ne peut pas ouvrir de session (`blocked`, `deleted`) reçoit
 * 403 `account_blocked` : le refus vaut à l'émission, la porte le répète à chaque
 * requête pour les jetons déjà émis.
 */
class SessionTokenIssuer
{
    public function __construct(private readonly PlatformSettingService $settings) {}

    /**
     * @return array{token: string, expires_at: CarbonInterface}
     */
    public function issue(User $user, string $name, bool $twoFactorJustVerified = false): array
    {
        // Chaque appelant refuse avant (`AuthRefusal`, code `account_blocked` lu par le front) :
        // ce refus-ci est l'invariant de l'émetteur, rendu par le mécanisme d'ADR-0032.
        if (! $user->canOpenSession()) {
            abort_code(403, 'auth.account_blocked');
        }

        $superAdmin = $user->isSuperAdmin();
        $absolute = $superAdmin
            ? (int) $this->settings->getValue('platform.session_max_minutes')
            : (int) config('auth.sessions.absolute_minutes');
        $idle = $superAdmin
            ? (int) config('auth.sessions.super_admin_idle_minutes')
            : (int) config('auth.sessions.idle_minutes');

        $expiresAt = now()->addMinutes($absolute);
        $newToken = $user->createToken($name, ['*'], $expiresAt);
        $newToken->accessToken->forceFill([
            'idle_timeout_minutes' => $idle,
            'two_factor_verified_at' => $twoFactorJustVerified ? now() : null,
        ])->save();

        return ['token' => $newToken->plainTextToken, 'expires_at' => $expiresAt];
    }

    /** Fin de validité du step-up porté par ce jeton, ou `null` s'il n'en porte pas de récent. */
    public static function stepUpValidUntil(mixed $token): ?CarbonInterface
    {
        if (! $token instanceof PersonalAccessToken || $token->two_factor_verified_at === null) {
            return null;
        }

        $until = Carbon::parse($token->two_factor_verified_at)->addMinutes((int) config('auth.sessions.step_up_minutes'));

        return $until->isFuture() ? $until : null;
    }

    public static function markStepUp(PersonalAccessToken $token): CarbonInterface
    {
        $token->forceFill(['two_factor_verified_at' => now()])->save();

        return now()->addMinutes((int) config('auth.sessions.step_up_minutes'));
    }
}
