<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class AgencyProvisioningResource extends BaseResource
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
                // TCK-270 — exposed so the wizard recap can display the
                // chosen currency without an extra round-trip.
                'currency' => $this->resource['agency']->currency?->value,
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
