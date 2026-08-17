<?php

namespace App\Http\Resources\Permissions;

use App\Http\Resources\Bases\BaseResource;
use App\Models\RoleDelegation;
use Illuminate\Http\Request;

class RoleDelegationResource extends BaseResource
{
    /** @var RoleDelegation */
    public $resource;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'user_id' => $this->resource->user_id,
            'user' => $this->whenLoaded('user', fn () => [
                'id' => $this->resource->user->id,
                'first_name' => $this->resource->user->first_name,
                'last_name' => $this->resource->user->last_name,
                'email' => $this->resource->user->email,
            ]),
            'delegator_id' => $this->resource->delegator_id,
            'delegator' => $this->whenLoaded('delegator', fn () => [
                'id' => $this->resource->delegator->id,
                'first_name' => $this->resource->delegator->first_name,
                'last_name' => $this->resource->delegator->last_name,
            ]),
            'agency_id' => $this->resource->agency_id,
            'role' => $this->resource->role,
            'role_label' => $this->translateRole($this->resource->role),
            'status' => $this->resource->status?->value,
            'status_label' => $this->translateStatus($this->resource->status?->value),
            'starts_at' => $this->resource->starts_at?->toIso8601String(),
            'ends_at' => $this->resource->ends_at?->toIso8601String(),
            'reason' => $this->resource->reason,
            'activated_at' => $this->resource->activated_at?->toIso8601String(),
            'expired_at' => $this->resource->expired_at?->toIso8601String(),
            'revoked_at' => $this->resource->revoked_at?->toIso8601String(),
            'revoked_by' => $this->whenLoaded('revokedBy', fn () => $this->resource->revokedBy?->id),
            'created_at' => $this->resource->created_at?->toIso8601String(),
            'updated_at' => $this->resource->updated_at?->toIso8601String(),
        ];
    }

    private function translateRole(string $role): string
    {
        return match ($role) {
            'agency_admin' => 'Administrateur d\'agence',
            'agent' => 'Agent',
            'owner' => 'Propriétaire',
            default => $role,
        };
    }

    private function translateStatus(?string $status): string
    {
        return match ($status) {
            'scheduled' => 'À venir',
            'active' => 'Actif',
            'expired' => 'Expiré',
            'revoked' => 'Révoqué',
            default => $status ?? 'Unknown',
        };
    }
}
