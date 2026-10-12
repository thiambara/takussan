<?php

namespace App\Http\Resources\Credits;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-633 lot F (ADR-0061 §5) — un boost, prix et durée figés. */
class PropertyBoostResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'agency_id' => $this->agency_id,
            'kind' => $this->kind?->value,
            'variant' => $this->variant?->value,
            'status' => $this->status?->value,
            'price_credits' => $this->price_credits,
            'duration_days' => $this->duration_days,
            'starts_at' => $this->iso($this->starts_at),
            'ends_at' => $this->iso($this->ends_at),
            'ended_at' => $this->iso($this->ended_at),
            'remaining_seconds' => $this->remaining_seconds,
            'offered' => (bool) $this->offered,
            'offer_reason' => $this->offer_reason,
            'refunded_credits' => $this->refunded_credits,
            'cancel_reason' => $this->cancel_reason,
            'property' => $this->whenLoaded('property', fn () => $this->property ? [
                'id' => $this->property->id, 'title' => $this->property->title, 'slug' => $this->property->slug,
            ] : null),
            'agency' => $this->whenLoaded('agency', fn () => $this->agency ? [
                'id' => $this->agency->id, 'name' => $this->agency->name,
            ] : null),
        ];
    }
}
