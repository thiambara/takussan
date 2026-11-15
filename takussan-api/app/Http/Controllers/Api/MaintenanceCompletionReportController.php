<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\MaintenanceRequest;
use App\Models\ServiceProviderBill;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Media\PdfImageEmbedder;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — le rapport de fin d'intervention
 * (`GET maintenance-requests/{id}/completion-report/pdf`), GÉNÉRÉ depuis la demande, jamais stocké : le
 * bien, les dates, les travaux demandés, les notes de résolution, le coût réel et les photos avant /
 * après. Les lecteurs : {@see MaintenanceRequestPolicy::viewCompletionReport()}. 404 tant
 * que le travail n'est pas rendu (`ServiceProviderBill::BILLABLE_REQUEST_STATUSES`, la règle que le coffre
 * du prestataire lit pour le lister).
 *
 * Les photos sont des collections PRIVÉES (TCK-538) : elles entrent en URI `data:` par
 * {@see PdfImageEmbedder}, jamais par URL ; une photo illisible est omise.
 */
class MaintenanceCompletionReportController extends Controller
{
    public function __invoke(Request $request, MaintenanceRequest $maintenanceRequest, DocumentPdfService $pdf, PdfImageEmbedder $embedder): SymfonyResponse
    {
        $this->authorize('viewCompletionReport', $maintenanceRequest);
        abort_unless(in_array($maintenanceRequest->status, ServiceProviderBill::BILLABLE_REQUEST_STATUSES, true), 404);

        $maintenanceRequest->loadMissing(['property.agency', 'assignee', 'media']);
        $photos = fn (string $collection): array => $maintenanceRequest->getMedia($collection)
            ->map(fn ($media) => $embedder->dataUri($media))
            ->filter()
            ->values()
            ->all();

        $locale = $request->user()?->preferredLocale() ?? app()->getLocale();
        $title = __('maintenance.completion_report_pdf.title', [], $locale);

        return $pdf->stream('pdf.maintenance.completion-report', [
            'mr' => $maintenanceRequest,
            'property' => $maintenanceRequest->property,
            'provider' => $maintenanceRequest->assignee,
            'agency' => $maintenanceRequest->property?->agency,
            'before' => $photos('before_photos'),
            'after' => $photos('completion_photos'),
            'locale' => $locale,
            'title' => $title,
            'document_label' => $title,
        ], 'rapport-intervention-'.$maintenanceRequest->id.'.pdf');
    }
}
