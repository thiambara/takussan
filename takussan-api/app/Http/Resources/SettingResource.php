<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SettingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'value' => $this->value,
            'scope' => $this->scope,
            'scope_id' => $this->scope_id,
            'updated_by_id' => $this->updated_by_id,
            'updated_at' => $this->updated_at,
        ];
    }
}
