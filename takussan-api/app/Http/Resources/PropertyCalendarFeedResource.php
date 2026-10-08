<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

/** TCK-596 §3B (ADR-0041) — un flux importé. Jamais son URL : seulement son hôte. */
class PropertyCalendarFeedResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'property_id' => $this->property_id,
            'url_host' => $this->url_host,
            'label' => $this->label,
            'last_synced_at' => $this->iso($this->last_synced_at),
            'last_status' => $this->last_status,
            'last_error' => $this->last_error,
            'failing_since' => $this->iso($this->failing_since),
            'consecutive_failures' => (int) $this->consecutive_failures,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
