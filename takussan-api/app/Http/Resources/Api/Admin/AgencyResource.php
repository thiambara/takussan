<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Wire-format for agencies inside the super-admin namespace (TCK-144). Kept
 * separate from the tenant-facing `AgencyResource` so admin-only attributes
 * (verification timestamps, primary admin id, audit counts) can be exposed
 * without bleeding into agency-side responses.
 */
class AgencyResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status?->value,
            'is_verified' => (bool) $this->is_verified,
            'verified_at' => $this->iso($this->verified_at),
            'primary_admin_id' => $this->primary_admin_id,
            'license_number' => $this->license_number,
            'email' => $this->email,
            'phone' => $this->phone,
            'logo_url' => $this->getFirstMediaUrl('logo') ?: null,
            // `live_properties_count` d'abord : c'est le compte calculé par la requête,
            // qui exclut les biens supprimés en douceur. `properties_count` est le
            // compteur dénormalisé de la table, servi de repli quand la ressource est
            // rendue hors de la requête de modération. Les deux existaient déjà et
            // portaient le même nom ; ils sont désormais distincts (cf.
            // `AgencyModerationController`).
            'properties_count' => (int) ($this->live_properties_count ?? $this->properties_count ?? 0),
            'members_count' => (int) ($this->members_count ?? 0),
            'last_activity_at' => $this->last_activity_at
                ? $this->iso(Carbon::parse($this->last_activity_at))
                : null,
            'created_at' => $this->iso($this->created_at),
        ];
    }
}
