<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\SearchAlias;
use Illuminate\Http\Request;

/**
 * TCK-2476 (ADR-0088 §7) — une variante d'écriture, pour la console : l'écriture repliée, ce qu'elle désigne, d'où elle
 * vient, son statut, et ses preuves (visiteurs distincts, saisies, période, confiance du modèle). Des codes, aucun libellé.
 *
 * @mixin SearchAlias
 */
class SearchAliasResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'alias' => $this->alias,
            'target_kind' => $this->enumValue($this->target_kind),
            'target_value' => $this->target_value,
            'target_city' => $this->target_city,
            'origin' => $this->enumValue($this->origin),
            'status' => $this->enumValue($this->status),
            'evidence' => $this->evidence,
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
