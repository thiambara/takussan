<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Maintenance\RejectQuoteRequest;
use App\Http\Requests\Maintenance\SubmitQuoteRequest;
use App\Http\Resources\MaintenanceRequestResource;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\MaintenanceQuoteWorkflow;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

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
        // TCK-592 — ADR-0037 : en `awaiting_owner`, le bailleur du bien seul.
        $this->authorize('decideQuote', $maintenanceRequest);

        $mr = $this->workflow->approveQuote($maintenanceRequest, $request->user()->id, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    public function rejectQuote(RejectQuoteRequest $request, MaintenanceRequest $maintenanceRequest): JsonResponse
    {
        $this->authorize('decideQuote', $maintenanceRequest);

        $data = $request->validated();
        $mr = $this->workflow->rejectQuote($maintenanceRequest, $data['reason'], $request->user()->id, $request->user());

        return $this->json([
            'data' => MaintenanceRequestResource::make($mr)->toArray($request),
        ]);
    }

    /**
     * TCK-592 (P12) — le devis en PDF, par le service PDF commun (`DocumentPdfService`), dans la
     * langue de qui le lit.
     */
    public function pdf(Request $request, MaintenanceRequest $maintenanceRequest, DocumentPdfService $pdf): SymfonyResponse
    {
        $this->authorize('viewQuote', $maintenanceRequest);
        abort_if($maintenanceRequest->quote_submitted_at === null, 404);

        $maintenanceRequest->loadMissing(['property.agency', 'assignee']);
        $locale = $request->user()?->preferredLocale() ?? app()->getLocale();

        return $pdf->stream('pdf.maintenance.quote', [
            'mr' => $maintenanceRequest,
            'lines' => $maintenanceRequest->quote_lines ?? [],
            'amount' => (float) $maintenanceRequest->quote_amount,
            'currency' => $maintenanceRequest->quote_currency ?? 'XOF',
            'property' => $maintenanceRequest->property,
            'provider' => $maintenanceRequest->assignee,
            'agency' => $maintenanceRequest->property?->agency,
            'locale' => $locale,
            'title' => __('maintenance.quote_pdf.title', [], $locale),
            'document_label' => __('maintenance.quote_pdf.title', [], $locale),
            'filename' => 'devis-intervention-'.$maintenanceRequest->id,
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
