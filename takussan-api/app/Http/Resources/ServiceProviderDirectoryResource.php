<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Http\Request;

/**
 * P21.06 (TCK-904) — une ligne du carnet des prestataires d'une agence.
 *
 * Les colonnes demandées par `fields[service_provider_profiles]`, le `User` inclus par sa
 * projection fixe (TCK-693), les dates sous les deux formes d'ADR-0018, et deux retraits : `insurance_policy_id` ne sort jamais, et de
 * `metadata` ne sortent que les sous-clés que le front lit (`ServiceProvidersList.tsx`,
 * `MaintenanceAssignmentBlock.tsx`) — nom, e-mail, métiers, zones et disponibilités du brouillon.
 * P234.04 (TCK-2280) — et le numéro saisi par l'agence à l'invitation, que le carnet rend.
 *
 * @mixin ServiceProviderProfile
 */
class ServiceProviderDirectoryResource extends BaseResource
{
    /** Les sous-clés de `metadata` que le carnet rend. */
    public const METADATA_KEYS = ['first_name', 'last_name', 'email', 'phone', 'trades', 'intervention_zones', 'availability'];

    public function toArray(Request $request): array
    {
        $data = IncludedUserResource::inParent($this->resource);
        unset($data['insurance_policy_id']);

        // TCK-2652 — `phone` : celui du compte, sinon celui de l'invitation (`metadata.phone`), que le
        // front appelle et ouvre dans WhatsApp ; `completed_interventions_count`, les interventions
        // réalisées pour l'agence du carnet. Lus par sous-requête (`ServiceProviderProfileController`).
        $accountPhone = $data['account_phone'] ?? null;
        unset($data['account_phone']);
        $data['phone'] = filled($accountPhone) ? $accountPhone : (data_get($this->resource->metadata, 'phone') ?: null);
        if (array_key_exists('completed_interventions_count', $data)) {
            $data['completed_interventions_count'] = (int) $data['completed_interventions_count'];
        }

        // TCK-2772 — le délai de réponse médian en minutes, nul sans mesure.
        if (array_key_exists('response_delay_minutes', $data)) {
            $data['response_delay_minutes'] = $data['response_delay_minutes'] === null ? null : (int) $data['response_delay_minutes'];
        }

        if (array_key_exists('metadata', $data) && is_array($data['metadata'])) {
            $data['metadata'] = array_intersect_key($data['metadata'], array_flip(self::METADATA_KEYS));
        }

        // ADR-0018 — la ligne sérialisée par Eloquent rend ses dates en `…T12:34:56.000000Z` : chacune
        // repasse par la forme de son cast, `active_until` en date de calendrier, le reste en instant.
        foreach (['created_at', 'updated_at', 'deleted_at'] as $instant) {
            if (array_key_exists($instant, $data)) {
                $data[$instant] = $this->iso($this->resource->{$instant});
            }
        }
        if (array_key_exists('active_until', $data)) {
            $data['active_until'] = $this->calendarDate($this->resource->active_until);
        }

        return $data;
    }
}
