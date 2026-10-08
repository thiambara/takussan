<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-596 §3B — une plage bloquée, vue de l'hôte. `ends_on` est exclusif (jour de départ). */
class PropertyUnavailabilityResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'starts_on' => $this->calendarDate($this->starts_on),
            'ends_on' => $this->calendarDate($this->ends_on),
            'reason' => $this->reason,
            'source' => $this->source,
            'calendar_feed_id' => $this->calendar_feed_id,
            'feed_name' => $this->whenLoaded('feed', fn () => $this->feed?->label ?: $this->feed?->url_host),
            'conflict_booking_id' => $this->conflict_booking_id,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
