<?php

namespace App\Services\Geo;

use App\Models\Enums\ReferentialStatus;
use App\Models\User;
use Illuminate\Validation\Rule;

/**
 * TCK-633 — les deux identifiants géographiques d'une adresse, mêmes règles à la création et à la
 * modification d'un bien. Un quartier se désigne par identifiant s'il est approuvé, ou s'il est
 * une proposition DE L'APPELANT — jamais la proposition d'un autre, qu'il ne voit pas.
 */
final class GeoAddressRules
{
    /** @return array<string, list<mixed>> */
    public static function regles(?User $user, mixed $villeId, bool $partiel): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $ville = is_numeric($villeId) ? (int) $villeId : null;

        return [
            'address.geo_city_id' => [...$base, 'integer', Rule::exists('geo_cities', 'id')],
            'address.geo_neighborhood_id' => [
                ...$base,
                'integer',
                Rule::exists('geo_neighborhoods', 'id')->where(function ($q) use ($user, $ville) {
                    $q->whereNull('merged_into_id');
                    if ($ville !== null) {
                        $q->where('geo_city_id', $ville);
                    }
                    $q->where(function ($q) use ($user) {
                        $q->where('status', ReferentialStatus::Approved->value);
                        if ($user !== null) {
                            $q->orWhere(fn ($q) => $q
                                ->where('status', ReferentialStatus::Pending->value)
                                ->where('created_by_id', $user->id));
                        }
                    });
                }),
            ],
        ];
    }
}
