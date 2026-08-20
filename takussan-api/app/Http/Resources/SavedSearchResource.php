<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class SavedSearchResource extends BaseResource
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
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
