<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\OwnerProfile;
use App\Support\Masking;
use Illuminate\Http\Request;

/**
 * TCK-601 (ADR-0044 §1) — un profil de bailleur tel que l'agence le lit : les colonnes demandées
 * par `fields[owner_profiles]=` (la liste reste pilotée par les sparse fieldsets, comme quand
 * `GET /api/owners` rendait le modèle brut), les relations demandées par `include=`, et les
 * identifiants sensibles **masqués seulement**.
 *
 * La valeur complète ne passe jamais par ici : `$hidden` la retire d'`attributesToArray()`, et les
 * trois `*_masked` sont calculés par {@see Masking}. Elle ne sort que par
 * `GET /api/owners/{owner_profile}/sensitive`, réservé à l'admin et journalisé.
 */
class OwnerProfileResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var OwnerProfile $profile */
        $profile = $this->resource;

        $attributes = $profile->attributesToArray();
        // `attributesToArray()` sérialise les instants par `toISOString()` (`…000000Z`) : ADR-0018
        // veut `iso()`. Seules les colonnes PRÉSENTES sont réécrites — les sparse fieldsets décident.
        foreach (['created_at', 'updated_at', 'deleted_at'] as $column) {
            if (array_key_exists($column, $attributes)) {
                $attributes[$column] = $this->iso($profile->getAttribute($column));
            }
        }

        return array_merge($attributes, $profile->relationsToArray(), [
            'rib_masked' => $this->masked($profile, 'rib', Masking::iban(...)),
            'tax_id_masked' => $this->masked($profile, 'tax_id', Masking::tail(...)),
            'id_document_number_masked' => $this->masked($profile, 'id_document_number', Masking::tail(...)),
        ]);
    }

    /** @param  callable(string): string  $mask */
    private function masked(OwnerProfile $profile, string $column, callable $mask): ?string
    {
        $value = $profile->getAttribute($column);

        return is_string($value) && $value !== '' ? $mask($value) : null;
    }
}
