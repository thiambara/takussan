<?php

namespace App\Http\Resources\Agency;

use App\Http\Resources\Bases\BaseResource;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use Illuminate\Http\Request;

/**
 * TCK-279 — `AgencyRole` exposé à la console `/admin/roles`.
 *
 * `capabilities` est une liste plate de valeurs (`properties.publish`, …)
 * et non d'objets pivot : c'est ce que la matrice de l'UI coche, et le
 * front possède les libellés (principe 5 — l'API émet des codes).
 *
 * @mixin AgencyRole
 */
class AgencyRoleResource extends BaseResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'name' => $this->name,
            'base_profile_type' => $this->enumValue($this->base_profile_type),
            'description' => $this->description,
            'is_system' => (bool) $this->is_system,
            'is_clonable' => (bool) $this->is_clonable,
            'capabilities' => $this->whenLoaded(
                'capabilities',
                fn () => $this->capabilities
                    ->map(static fn (AgencyRoleCapability $row): string => (string) $row->capability)
                    ->values()
                    ->all(),
                fn () => $this->capabilityEnums()->map(fn ($c) => $c->value)->all(),
            ),
            // Compte des profils portant ce rôle — l'UI en a besoin pour
            // griser « Supprimer » avant même de tenter le 409.
            'profiles_count' => $this->attachedProfilesCount(),
            'created_at' => $this->iso($this->created_at),
            'updated_at' => $this->iso($this->updated_at),
        ];
    }
}
