<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §2) — un lot de crédits. */
class CreditLotResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'origin' => $this->origin?->value,
            'initial_amount' => $this->initial_amount,
            'remaining_amount' => $this->remaining_amount,
            'expires_at' => $this->iso($this->expires_at),
            'reason' => $this->reason,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
