<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SavedSearchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'name' => $this->name,
            'criteria' => $this->criteria,
            'notification_frequency' => $this->notification_frequency,
            'is_active' => (bool) $this->is_active,
            'results_count' => $this->results_count,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
