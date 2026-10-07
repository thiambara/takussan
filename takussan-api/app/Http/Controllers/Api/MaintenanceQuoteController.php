<?php

namespace App\Http\Controllers\Api;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Maintenance\RejectQuoteRequest;
use App\Http\Requests\Maintenance\SubmitQuoteRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MaintenanceQuoteController extends Controller
{
    public function __construct(
        protected MaintenanceQuoteWorkflow $workflow,
        protected NotificationService $notifications,
    ) {}

    public function requestQuote(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $mr = $this->workflow->requestQuote($maintenanceRequest);

        if ($mr->assigned_to) {
            $this->notifications->send($mr->assignee, NotificationCode::MaintenanceQuoteRequested, [
                'request' => $mr->title,
            ], NotificationTarget::of('maintenance', $mr->id));
        }

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

        $mr = $this->workflow->submitQuote($maintenanceRequest, $data, $attachments);

        // Notify Agent or Owner (who requested it, or property owner)
        $notifiable = $mr->requester ?? $mr->property?->owner;
        if ($notifiable) {
            $this->notifications->send($notifiable, NotificationCode::MaintenanceQuoteSubmitted, [
                'request' => $mr->title,
                'amount' => NotificationRenderer::money($mr->quote_amount, $mr->quote_currency),
            ], NotificationTarget::of('maintenance', $mr->id));
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function approveQuote(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $mr = $this->workflow->approveQuote($maintenanceRequest, $request->user()->id);

        if ($mr->assigned_to) {
            $this->notifications->send($mr->assignee, NotificationCode::MaintenanceQuoteApproved, [
                'request' => $mr->title,
            ], NotificationTarget::of('maintenance', $mr->id));
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function rejectQuote(RejectQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('manageQuotes', $maintenanceRequest);

        $data = $request->validated();
        $mr = $this->workflow->rejectQuote($maintenanceRequest, $data['reason'], $request->user()->id);

        if ($mr->assigned_to) {
            $this->notifications->send($mr->assignee, NotificationCode::MaintenanceQuoteRejected, [
                'request' => $mr->title,
            ], NotificationTarget::of('maintenance', $mr->id));
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function start(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        // Provider or agent can start
        $this->authorize('update', $maintenanceRequest);

        $mr = $this->workflow->start($maintenanceRequest);

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }
}
