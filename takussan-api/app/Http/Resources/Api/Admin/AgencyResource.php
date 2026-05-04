<?php

namespace App\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire-format for agencies inside the super-admin namespace (TCK-144). Kept
 * separate from the tenant-facing `AgencyResource` so admin-only attributes
 * (verification timestamps, primary admin id, audit counts) can be exposed
 * without bleeding into agency-side responses.
 */
class AgencyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'is_verified' => (bool) $this->is_verified,
            'verified_at' => $this->verified_at?->toIso8601String(),
            'primary_admin_id' => $this->primary_admin_id,
            'license_number' => $this->license_number,
            'email' => $this->email,
            'phone' => $this->phone,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
