<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Http\Request;

class UserListResource extends BaseResource
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
            'status' => $this->status?->value,
            'email_verified_at' => $this->iso($this->email_verified_at),
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            'last_login_at' => $this->iso($this->last_login_at),
            'created_at' => $this->iso($this->created_at),
            'roles' => collect($this->admin_role_rows ?? [])->values()->all(),
            'agencies' => $this->profileAgencies(),
        ];
    }

    private function profileAgencies(): array
    {
        return $this->agentProfiles
            ->concat($this->ownerProfiles)
            ->map(fn (AgentProfile|OwnerProfile $profile) => $profile->agency)
            ->filter()
            ->unique('id')
            ->values()
            ->map(fn ($agency) => [
                'id' => $agency->id,
                'name' => $agency->name,
                'slug' => $agency->slug,
            ])
            ->all();
    }
}
