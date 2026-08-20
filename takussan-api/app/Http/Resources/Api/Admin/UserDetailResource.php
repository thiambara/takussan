<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Http\Request;

class UserDetailResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'status' => $this->status?->value,
            'preferred_language' => $this->preferred_language,
            'timezone' => $this->timezone,
            'email_verified_at' => $this->iso($this->email_verified_at),
            'phone_verified_at' => $this->iso($this->phone_verified_at),
            'last_login_at' => $this->iso($this->last_login_at),
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            'created_at' => $this->iso($this->created_at),
            // TCK-278 — `roles` est désormais dérivé des profils polymorphes.
            // `admin_role_rows` (legacy) peut encore alimenter ce champ pour
            // les vues admin qui exposent un détail par-agence.
            'roles' => collect($this->admin_role_rows ?? $this->profileTypes()->map(fn (string $name) => [
                'name' => $name,
                'team_id' => null,
            ])->all())->values()->all(),
            'profiles' => [
                'agent' => $this->agentProfiles->map(fn (AgentProfile $profile) => [
                    'id' => $profile->id,
                    'agency_id' => $profile->agency_id,
                    'agency_name' => $profile->agency?->name,
                    'status' => $profile->status?->value,
                    'license_number' => $profile->license_number,
                ])->values()->all(),
                'owner' => $this->ownerProfiles->map(fn (OwnerProfile $profile) => [
                    'id' => $profile->id,
                    'agency_id' => $profile->agency_id,
                    'agency_name' => $profile->agency?->name,
                    'status' => $profile->status?->value,
                ])->values()->all(),
                'broker' => $this->brokerProfile ? [
                    'id' => $this->brokerProfile->id,
                    'status' => $this->brokerProfile->status?->value,
                ] : null,
                'service_provider' => $this->serviceProviderProfile ? [
                    'id' => $this->serviceProviderProfile->id,
                    'status' => $this->serviceProviderProfile->status?->value,
                ] : null,
            ],
            'agencies' => $this->profileAgencies(),
            'mfa_enabled' => (bool) $this->two_factor_enabled,
        ];
    }

    private function profileAgencies(): array
    {
        return $this->agentProfiles
            ->concat($this->ownerProfiles)
            ->map(fn ($profile) => $profile->agency)
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
