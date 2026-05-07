<?php

namespace App\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AgencyProvisioningResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'agency' => [
                'id' => $this->resource['agency']->id,
                'name' => $this->resource['agency']->name,
                'slug' => $this->resource['agency']->slug,
                'status' => $this->resource['agency']->status?->value,
                'is_verified' => (bool) $this->resource['agency']->is_verified,
                'primary_admin_id' => $this->resource['agency']->primary_admin_id,
            ],
            'admin' => [
                'id' => $this->resource['admin']->id,
                'first_name' => $this->resource['admin']->first_name,
                'last_name' => $this->resource['admin']->last_name,
                'full_name' => $this->resource['admin']->full_name,
                'email' => $this->resource['admin']->email,
                'preferred_language' => $this->resource['admin']->preferred_language,
            ],
        ];
    }
}
