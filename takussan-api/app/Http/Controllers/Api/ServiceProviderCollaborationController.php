<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ServiceProvider\EndServiceProviderCollaborationRequest;
use App\Http\Requests\ServiceProvider\UpdateServiceProviderCollaborationRequest;
use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Profiles\ServiceProviderCollaborationService;
use Illuminate\Http\JsonResponse;

/**
 * TCK-592 — fin et pause d'une collaboration prestataire ↔ agence, des deux côtés.
 * Les règles vivent dans {@see ServiceProviderCollaborationService}.
 */
class ServiceProviderCollaborationController extends Controller
{
    public function __construct(private readonly ServiceProviderCollaborationService $service) {}

    public function updateForAgency(
        UpdateServiceProviderCollaborationRequest $request,
        Agency $agency,
        ServiceProviderProfile $sp_profile,
    ): JsonResponse {
        $collaboration = ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $sp_profile->id)
            ->where('agency_id', $agency->id)
            ->firstOrFail();

        $collaboration = $this->service->change(
            $collaboration,
            CollaborationStatus::from($request->validated('status')),
            $request->user(),
        );

        return $this->json(['data' => $this->present($collaboration)]);
    }

    public function endForProvider(
        EndServiceProviderCollaborationRequest $request,
        ServiceProviderAgencyCollaboration $collaboration,
    ): JsonResponse {
        $collaboration = $this->service->end($collaboration, $request->user());

        return $this->json(['data' => $this->present($collaboration)]);
    }

    /** @return array<string, mixed> */
    private function present(ServiceProviderAgencyCollaboration $collaboration): array
    {
        return [
            'id' => $collaboration->id,
            'service_provider_profile_id' => $collaboration->service_provider_profile_id,
            'agency_id' => $collaboration->agency_id,
            'status' => $collaboration->status?->value,
            'started_at' => $collaboration->started_at?->toDateString(),
            'ended_at' => $collaboration->ended_at?->toDateString(),
            'paused_by' => data_get($collaboration->metadata, 'paused_by'),
        ];
    }
}
