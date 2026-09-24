<?php

namespace App\Http\Resources\Messaging;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/**
 * TCK-576 — un bien auquel rattacher une conversation de groupe, tel que le sélecteur l'affiche :
 * son titre, et sa référence pour distinguer deux biens de même titre (onze titres de la démo sont
 * portés par plusieurs biens). Rien d'autre : ni prix, ni adresse, ni propriétaire.
 */
class GroupContextPropertyResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'reference_number' => $this->reference_number,
        ];
    }
}
