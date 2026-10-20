<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use Illuminate\Http\Request;

/**
 * TCK-1049 (piste P61.02) — une ligne de `GET /api/me/service-provider/collaborations`.
 *
 * Avant, la liste rendait `$paginator->items()` : la collaboration brute (`metadata`, dont
 * `paused_by`, et `deleted_at`), et pour `include=agency` la ligne `agencies` entière, seuil des
 * reversements, `bank_csv_mapping` et `settings` compris. L'agence passe désormais par
 * {@see AgencyResource}, qui juge ce que l'appelant voit (le seuil n'y sort que pour qui prépare
 * ou approuve les reversements de l'agence).
 *
 * Les colonnes passent par `whenHas` : la route accepte `fields[service_provider_agency_collaborations]`,
 * et une colonne non lue ne sort pas à `null` (TCK-336).
 */
class ServiceProviderAgencyCollaborationResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var ServiceProviderAgencyCollaboration $collaboration */
        $collaboration = $this->resource;

        return [
            'id' => $this->whenHas('id'),
            'service_provider_profile_id' => $this->whenHas('service_provider_profile_id'),
            'agency_id' => $this->whenHas('agency_id'),
            'agency_role_id' => $this->whenHas('agency_role_id'),
            'status' => $this->whenHas('status', fn () => $this->enumValue($collaboration->status)),
            'started_at' => $this->whenHas('started_at', fn () => $this->calendarDate($collaboration->started_at)),
            'ended_at' => $this->whenHas('ended_at', fn () => $this->calendarDate($collaboration->ended_at)),
            'created_at' => $this->whenHas('created_at', fn () => $this->iso($collaboration->created_at)),
            'updated_at' => $this->whenHas('updated_at', fn () => $this->iso($collaboration->updated_at)),
            'agency' => $this->whenLoaded('agency', fn () => $collaboration->agency === null
                ? null
                : (new AgencyResource($collaboration->agency))->resolve($request)),
        ];
    }
}
