<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\StoreMaintenanceRescheduleRequestRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\RescheduleRequests;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2917 (ADR-0118 § 3) — `POST /api/maintenance-requests/{id}/reschedule-requests` : le demandeur
 * demande un autre créneau. L'autorisation (`requestReschedule`, 403) court dans le FormRequest, avant
 * la validation. Rend la demande, `pending_reschedule_request` posé, en 201 ; `scheduled_at` inchangé.
 */
class MaintenanceRescheduleRequestController extends Controller
{
    public function __construct(private readonly RescheduleRequests $reschedules) {}

    public function store(StoreMaintenanceRescheduleRequestRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->reschedules->request($maintenanceRequest, $request->user(), $request->slots(), $request->validated('note'));

        $maintenanceRequest->refresh()->load(['property', 'requester', 'assignee']);

        return $this->json(['data' => MaintenanceRequestResource::make($maintenanceRequest)->resolve($request)], 201);
    }
}
