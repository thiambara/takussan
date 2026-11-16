<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\ServiceProviderBill;
use App\Policies\ServiceProviderBillPolicy;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — le PDF d'une facture d'intervention
 * (`GET service-provider-bills/{bill}/pdf`), que l'entrée « Mes factures » du coffre sert comme
 * `download_path`. Les lecteurs : {@see ServiceProviderBillPolicy::downloadPdf()}. Le
 * gabarit suit la langue du LECTEUR ; le montant s'écrit par `@currency` (XOF sans sous-unité).
 */
class ServiceProviderBillPdfController extends Controller
{
    public function __invoke(Request $request, int $bill, DocumentPdfService $pdf): SymfonyResponse
    {
        $found = ServiceProviderBill::query()
            ->with(['maintenanceRequest:id,title', 'property:id,title,user_id,agency_id', 'provider:id,first_name,last_name,username', 'agency'])
            ->findOrFail($bill);
        $this->authorize('downloadPdf', $found);

        return self::rendre($pdf, $found, $request->user()?->preferredLocale() ?? app()->getLocale());
    }

    /**
     * TCK-2898 — le rendu seul, sans autorisation : l'archive du coffre (« Relevés et factures » du
     * bailleur, `ArchiveDuCoffre`) le rejoue sur une entrée que le coffre a déjà jugée.
     */
    public static function rendre(DocumentPdfService $pdf, ServiceProviderBill $bill, string $locale): SymfonyResponse
    {
        $bill->loadMissing(['maintenanceRequest:id,title', 'property:id,title,user_id,agency_id', 'provider:id,first_name,last_name,username', 'agency']);
        $title = __('maintenance.bill_pdf.title', [], $locale);

        return $pdf->stream('pdf.service-provider-bills.bill', [
            'bill' => $bill,
            'provider' => $bill->provider,
            'agency' => $bill->agency,
            'locale' => $locale,
            'title' => $title,
            'document_label' => $title,
        ], 'facture-'.($bill->reference_number ?? $bill->id).'.pdf');
    }
}
