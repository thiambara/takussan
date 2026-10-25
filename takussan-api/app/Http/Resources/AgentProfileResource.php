<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\AgentProfile;
use Illuminate\Http\Request;

/**
 * TCK-2045 (P61.04) — un profil d'agent rendu par `PATCH /api/profiles/{agent_profile}/suspend`.
 * Sans `metadata` : `Me\AgentProfileController` y range le KYC de l'agent, que `toArray()` rendait
 * entier à qui le suspend.
 *
 * @mixin AgentProfile
 */
class AgentProfileResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'agency_id' => $this->agency_id,
            'agency_role_id' => $this->agency_role_id,
            'status' => $this->enumValue($this->status),
            'license_number' => $this->license_number,
            'commission_rate' => $this->commission_rate !== null ? (float) $this->commission_rate : null,
            'specialty' => $this->specialty,
            'hire_date' => $this->calendarDate($this->hire_date),
            'active_until' => $this->calendarDate($this->active_until),
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
