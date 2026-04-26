<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Maintenance\RejectQuoteRequest;
use App\Http\Requests\Maintenance\SubmitQuoteRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use App\Services\Model\NotificationService;
use App\Models\Enums\NotificationType;
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
        $this->authorizeAgentOrOwner($request, $maintenanceRequest);

        $mr = $this->workflow->requestQuote($maintenanceRequest);

        if ($mr->assigned_to) {
            $this->notifications->notify(
                $mr->assignee,
                NotificationType::Maintenance,
                'Demande de devis pour: ' . $mr->title,
                "Une demande de devis a été requise pour l'intervention: {$mr->title}.",
                ['maintenance_request_id' => $mr->id],
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function submitQuote(SubmitQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorizeProvider($request, $maintenanceRequest);

        $data = $request->validated();
        $attachments = $request->file('attachments', []) ?? [];
        if (!is_array($attachments)) {
            $attachments = [$attachments];
        }

        $mr = $this->workflow->submitQuote($maintenanceRequest, $data, $attachments);

        // Notify Agent or Owner (who requested it, or property owner)
        $notifiable = $mr->requester ?? $mr->property?->owner;
        if ($notifiable) {
            $this->notifications->notify(
                $notifiable,
                NotificationType::Maintenance,
                'Devis soumis pour: ' . $mr->title,
                "Un devis de {$mr->quote_amount} {$mr->quote_currency} a été soumis pour l'intervention: {$mr->title}.",
                ['maintenance_request_id' => $mr->id],
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function approveQuote(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorizeAgentOrOwner($request, $maintenanceRequest);

        $mr = $this->workflow->approveQuote($maintenanceRequest, $request->user()->id);

        if ($mr->assigned_to) {
            $this->notifications->notify(
                $mr->assignee,
                NotificationType::Maintenance,
                'Devis approuvé pour: ' . $mr->title,
                "Votre devis pour l'intervention: {$mr->title} a été approuvé.",
                ['maintenance_request_id' => $mr->id],
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function rejectQuote(RejectQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorizeAgentOrOwner($request, $maintenanceRequest);

        $data = $request->validated();
        $mr = $this->workflow->rejectQuote($maintenanceRequest, $data['reason'], $request->user()->id);

        if ($mr->assigned_to) {
            $this->notifications->notify(
                $mr->assignee,
                NotificationType::Maintenance,
                'Devis rejeté pour: ' . $mr->title,
                "Votre devis pour l'intervention: {$mr->title} a été rejeté.",
                ['maintenance_request_id' => $mr->id],
            );
        }

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function start(Request $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        // Provider or agent can start
        $this->authorizeManage($request, $maintenanceRequest);

        $mr = $this->workflow->start($maintenanceRequest);

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    protected function authorizeAgentOrOwner(Request $request, MaintenanceRequest $mr): void
    {
        $user = $request->user();
        $property = $mr->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }

    protected function authorizeProvider(Request $request, MaintenanceRequest $mr): void
    {
        $user = $request->user();
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $mr->assigned_to === $user->id;

        abort_unless($ok, 403);
    }

    protected function authorizeManage(Request $request, MaintenanceRequest $mr): void
    {
        $user = $request->user();
        $property = $mr->property;
        $ok = $user->hasRole(['admin', 'super_admin'])
            || $mr->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);

        abort_unless($ok, 403);
    }
}
