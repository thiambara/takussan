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
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
