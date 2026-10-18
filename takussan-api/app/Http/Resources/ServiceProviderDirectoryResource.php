<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Http\Request;

/**
 * P21.06 (TCK-904) — une ligne du carnet des prestataires d'une agence.
 *
 * Les colonnes demandées par `fields[service_provider_profiles]`, le `User` inclus par sa
 * projection fixe (TCK-693), et deux retraits : `insurance_policy_id` ne sort jamais, et de
 * `metadata` ne sortent que les sous-clés que le front lit (`ServiceProvidersList.tsx`,
 * `MaintenanceAssignmentBlock.tsx`) — nom, e-mail, métiers, zones et disponibilités du brouillon.
 *
 * @mixin ServiceProviderProfile
 */
class ServiceProviderDirectoryResource extends BaseResource
{
    /** Les sous-clés de `metadata` que le carnet rend. */
    public const METADATA_KEYS = ['first_name', 'last_name', 'email', 'trades', 'intervention_zones', 'availability'];

    public function toArray(Request $request): array
    {
        $data = IncludedUserResource::inParent($this->resource);
        unset($data['insurance_policy_id']);

        if (array_key_exists('metadata', $data) && is_array($data['metadata'])) {
            $data['metadata'] = array_intersect_key($data['metadata'], array_flip(self::METADATA_KEYS));
        }

        return $data;
    }
}
