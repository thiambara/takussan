<?php

namespace App\Services\Auth;

/** TCK-2926 (ADR-0124 § 2) — aucune base de villes n'est branchée : la ville de connexion vaut `null`. */
final class NullLoginCityResolver implements LoginCityResolver
{
    public function cityFor(string $ip): ?string
    {
        return null;
    }
}
