<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'bio' => $this->bio,
            'avatar_url' => $this->getFirstMediaUrl('avatar') ?: null,
            'email_verified_at' => $this->email_verified_at?->toIso8601String(),
            'phone_verified_at' => $this->phone_verified_at?->toIso8601String(),
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            'agency_id' => $this->agency_id,
            'roles' => $this->getRoleNames()->values()->all(),
            'status' => $this->status?->value,
            // TCK-253 — opt-in personalisation hints set via PATCH /api/me.
            // Always returned as an object (possibly empty) so clients can
            // assume the shape without null-checks.
            'preferences' => is_array($this->preferences) ? $this->preferences : (object) [],
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
