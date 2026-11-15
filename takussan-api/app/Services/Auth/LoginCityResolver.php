<?php

namespace App\Services\Auth;

use Illuminate\Container\Attributes\Bind;

/**
 * TCK-2926 (ADR-0124 § 2) — la ville d'une adresse IP, résolue LOCALEMENT (base hors ligne) au moment de la
 * connexion. Aucune implémentation ne doit envoyer l'IP à un service tiers ; l'IP n'est jamais rendue ni gardée.
 *
 * Aucune base n'est livrée aujourd'hui : le lien par défaut rend `null`.
 */
#[Bind(NullLoginCityResolver::class)]
interface LoginCityResolver
{
    /** La ville seule (jamais le quartier ni les coordonnées), ou `null` sans résolution. */
    public function cityFor(string $ip): ?string;
}
