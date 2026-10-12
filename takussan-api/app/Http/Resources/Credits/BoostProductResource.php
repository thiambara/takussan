<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §4) — une offre du catalogue. */
class BoostProductResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind?->value,
            'variant' => $this->variant?->value,
            'duration_days' => $this->duration_days,
            'price_credits' => $this->price_credits,
            'is_active' => (bool) $this->is_active,
            'sort_order' => $this->sort_order,
        ];
    }
}
