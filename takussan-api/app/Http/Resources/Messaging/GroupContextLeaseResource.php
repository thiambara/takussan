<?php

namespace App\Http\Resources\Messaging;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-576 — un bail auquel rattacher une conversation de groupe : sa référence et, sur
 * `include=property`, le titre de son bien. Ni loyer, ni locataire, ni dates : le sélecteur n'en a
 * pas besoin, et un membre de l'équipe qui ouvre « Nouveau groupe » n'a pas à les lire ici.
 */
class GroupContextLeaseResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'property' => $this->whenLoaded(
                'property',
                fn () => $this->property ? GroupContextPropertyResource::make($this->property)->toArray($request) : null,
            ),
        ];
    }
}
