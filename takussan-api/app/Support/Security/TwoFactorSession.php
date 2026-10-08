<?php

namespace App\Support\Security;

use App\Models\User;
use App\Services\Auth\SessionTokenIssuer;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * TCK-589, vérification adverse B2 — la 2FA exigée juge la SESSION, pas le compte.
 *
 * `two_factor_enabled` dit « ce compte a configuré un TOTP » ; il ne dit pas « ce jeton a été
 * obtenu avec ». Par OAuth, un compte à 2FA recevait un jeton sans jamais saisir son TOTP, et
 * ce jeton ouvrait la console. Le jeton porte la preuve : `two_factor_verified_at` est posé par
 * {@see SessionTokenIssuer} quand un second facteur vient d'être saisi, puis
 * renouvelé par le step-up. Récent, il vaut step-up ; présent, il vaut session à deux facteurs.
 *
 * Aucun autre porteur ne vaut preuve : pas de jeton (session sans Sanctum), un `TransientToken`,
 * ou un jeton sans la colonne, tous refusés là où la 2FA est exigée.
 */
final class TwoFactorSession
{
    public static function verified(User $user): bool
    {
        $token = $user->currentAccessToken();

        return $token instanceof PersonalAccessToken && $token->two_factor_verified_at !== null;
    }
}
