<?php

namespace App\Services\Credits;

use Illuminate\Http\Request;

/**
 * TCK-2663 — l'espace ACTIF dont on lit le portefeuille, écrit une fois : le contrôleur de
 * `GET /api/credits` et les `FormRequest` des mises en avant le lisent ici, pour qu'aucune lecture
 * du portefeuille ne vise un autre espace que les autres.
 */
final class WalletSpace
{
    public static function idFor(Request $request): ?int
    {
        $agencyId = $request->activeProfile()?->agency_id ?? $request->user()?->agency_id;

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
