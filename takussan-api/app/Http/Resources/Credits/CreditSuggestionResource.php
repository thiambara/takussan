<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Property;
use Illuminate\Http\Request;

/**
 * TCK-2663 — un bien à pousser : la carte du bien, ses vues cumulées, et la date de son dernier
 * contact (`null` : jamais contacté). Aucune donnée du demandeur.
 *
 * @mixin Property
 */
class CreditSuggestionResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return CreditBoostResource::propertyCard($this->resource) + [
            'views_count' => (int) $this->views_count,
            'last_contact_at' => $this->iso($this->last_contact_at),
        ];
    }
}
