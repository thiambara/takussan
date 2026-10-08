<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class AgencyDetailResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        // `whenLoaded()` rend un `MissingValue` (objet, donc vrai) quand la relation n'est pas
        // chargée — ce que fait la fiche lue par un `viewer` (TCK-600).
        $primaryAdmin = $this->relationLoaded('primaryAdmin') ? $this->primaryAdmin : null;
        $address = $this->relationLoaded('addresses') ? $this->addresses->first() : null;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'is_verified' => (bool) $this->is_verified,
            'verified_at' => $this->iso($this->verified_at),
            'license_number' => $this->license_number,
            'email' => $this->email,
            'phone' => $this->phone,
            'website' => $this->website,
            'description' => $this->description,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            'currency' => $this->currency?->value,
            'founded_at' => $this->calendarDate($this->founded_at),
            'created_at' => $this->iso($this->created_at),
            'logo_url' => $this->getFirstMediaUrl('logo') ?: null,
            'public_url' => "/agencies/{$this->slug}",
            'primary_admin' => $primaryAdmin ? [
                'id' => $primaryAdmin->id,
                'full_name' => $primaryAdmin->full_name,
                'email' => $primaryAdmin->email,
            ] : null,
            'address' => $address ? [
                'line1' => $address->line1,
                'line2' => $address->line2,
                'city' => $address->city,
                'region' => $address->region,
                'country' => $address->country,
            ] : null,
        ];
    }
}
