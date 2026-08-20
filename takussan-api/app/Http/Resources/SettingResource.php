<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class SettingResource extends BaseResource
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
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
