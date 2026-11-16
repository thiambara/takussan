<?php

namespace App\Services\Profiles;

use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2847 (ADR-0116 § 2) — juger « comme si ce profil était actif » : l'attribut `active_profile`
 * de la requête courante, que lisent `request()->activeProfile()`, `User::agency_id` et
 * `staffAgencyId()`, est posé le temps de l'appel, puis RENDU tel qu'il était (présent ou absent),
 * même sur une exception. Le motif de `DocumentExpiryReminder::destinataire()`.
 *
 * Aucune décision n'est prise ici : l'appelant pose sa question (une policy, une portée de liste)
 * sous le profil, et c'est elle qui juge.
 */
final class SousLeProfil
{
    /**
     * @template T
     *
     * @param  callable(): T  $question
     * @return T
     */
    public static function juger(Model $profil, callable $question): mixed
    {
        $attributs = request()->attributes;
        $avait = $attributs->has('active_profile');
        $avant = $attributs->get('active_profile');
        $attributs->set('active_profile', $profil);

        try {
            return $question();
        } finally {
            $avait ? $attributs->set('active_profile', $avant) : $attributs->remove('active_profile');
        }
    }
}
