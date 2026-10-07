<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Maintenance\RejectQuoteRequest;
use App\Http\Requests\Maintenance\SubmitQuoteRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceQuoteController extends Controller
{
    /**
     * TCK-592 — aucune notification ici : chaque geste émet `MaintenanceStatusChanged`, que
     * `NotifyMaintenanceParticipants` traduit pour chaque destinataire. La prose française écrite en
     * dur notifiait le demandeur du prix (P13) et jamais l'agence.
     */
    public function __construct(
        protected MaintenanceQuoteWorkflow $workflow,
    ) {}

    public function requestQuote(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $mr = $this->workflow->requestQuote($maintenanceRequest, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function submitQuote(SubmitQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('actAsProvider', $maintenanceRequest);

        $data = $request->validated();
        $attachments = $request->file('attachments', []) ?? [];
        if (! is_array($attachments)) {
            $attachments = [$attachments];
        }

        $mr = $this->workflow->submitQuote($maintenanceRequest, $data, $attachments, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function approveQuote(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $mr = $this->workflow->approveQuote($maintenanceRequest, $request->user()->id, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function rejectQuote(RejectQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $data = $request->validated();
        $mr = $this->workflow->rejectQuote($maintenanceRequest, $data['reason'], $request->user()->id, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function start(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        // TCK-592 — démarrer est une transition : (acteur, `in_progress`).
        $this->authorize('transitionTo', [$maintenanceRequest, MaintenanceStatus::InProgress]);

        $mr = $this->workflow->start($maintenanceRequest, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }
}
