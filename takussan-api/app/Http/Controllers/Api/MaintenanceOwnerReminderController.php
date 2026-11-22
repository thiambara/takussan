<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\OwnerReminder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2786 — `POST /api/maintenance-requests/{id}/owner-reminders` : « Relancer le bailleur ».
 * L'autorisation (`MaintenanceRequestPolicy::remindOwner`, 403) précède tout ; le statut, le
 * bailleur joignable et la cadence se jugent sous le verrou ({@see OwnerReminder}, 409). Rend la
 * demande, `owner_reminded_at` posé, en 201.
 */
class MaintenanceOwnerReminderController extends Controller
{
    public function __construct(private readonly OwnerReminder $reminders) {}

    public function store(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('remindOwner', $maintenanceRequest);

        $mr = $this->reminders->remind($maintenanceRequest, $request->user());
        $mr->load(['property', 'requester', 'assignee']);

        return $this->json(['data' => MaintenanceRequestResource::make($mr)->resolve($request)], 201);
    }
}
