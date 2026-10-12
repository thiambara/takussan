<?php

namespace Tests\Support;

use App\Models\User;
use App\Services\Property\PublishReadiness;

/**
 * TCK-633 (lot C) — un compte qui peut publier : prénom, numéro VÉRIFIÉ, CGU acceptées. Les
 * tests qui publient sans parler du contact s'en servent ; ceux qui éprouvent la règle
 * (`PublishReadinessTest`) s'en passent.
 */
trait PubliePret
{
    protected function rendrePubliable(User ...$users): void
    {
        foreach ($users as $user) {
            $user->forceFill([
                'first_name' => trim((string) $user->first_name) !== '' ? $user->first_name : 'Awa',
                // Unique par compte : `users_phone_verified_unique` refuserait deux numéros vérifiés égaux.
                'phone' => $user->phone ?: '+2217'.str_pad((string) $user->id, 8, '0', STR_PAD_LEFT),
                'phone_verified_at' => $user->phone_verified_at ?? now(),
                'terms_accepted_at' => $user->terms_accepted_at ?? now(),
                'terms_version' => $user->terms_version ?? PublishReadiness::TERMS_VERSION,
            ])->save();
        }
    }
}
