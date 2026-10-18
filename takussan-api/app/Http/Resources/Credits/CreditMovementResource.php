<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §2) — une ligne du journal, jamais réécrite. */
class CreditMovementResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type?->value,
            'amount' => $this->amount,
            'credit_lot_id' => $this->credit_lot_id,
            'property_boost_id' => $this->property_boost_id,
            'actor_id' => $this->actor_id,
            'reason' => $this->reason,
            // TCK-825 (P24.03) — l'objet d'une dépense ou d'un remboursement de boost : le bien et
            // l'offre. Le genre et la variante, pas la durée : une Vedette prolongée cumule la sienne.
            'boost' => $this->whenLoaded('boost', fn () => $this->boost ? [
                'id' => $this->boost->id,
                'kind' => $this->boost->kind?->value,
                'variant' => $this->boost->variant?->value,
                'property' => $this->boost->property ? ['id' => $this->boost->property->id, 'title' => $this->boost->property->title] : null,
            ] : null),
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
