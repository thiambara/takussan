<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\ServiceProviderBillStatementRequest;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\ServiceProviderBill;
use App\Services\Pdf\DocumentPdfService;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/**
 * TCK-2911 (ADR-0120 § 2) — « Relevé de mes factures » : le PDF des factures dont l'APPELANT est le
 * prestataire, sur une période (`from`, `to`, jours inclus ; défaut : le mois en cours ; 366 jours
 * au plus). Hors brouillons — pas encore émis. Une facture est datée par son envoi (`submitted_at`),
 * à défaut par sa naissance (factures antérieures à l'ADR). Aucune facture d'un autre prestataire :
 * le périmètre est `provider_id`, jamais l'agence du lecteur.
 */
class ServiceProviderBillStatementController extends Controller
{
    /** Ce qui ne compte pas au facturé : la facture refusée ou tombée avec son intervention. */
    private const NOT_BILLED = [ServiceProviderBillStatus::Rejected, ServiceProviderBillStatus::Cancelled];

    public function __invoke(ServiceProviderBillStatementRequest $request, DocumentPdfService $pdf): SymfonyResponse
    {
        [$from, $to] = [$request->periodStart(), $request->periodEnd()];

        $user = $request->user();
        $bills = ServiceProviderBill::query()
            ->with(['maintenanceRequest:id,title', 'property:id,title'])
            ->where('provider_id', $user->id)
            ->where('status', '!=', ServiceProviderBillStatus::Draft->value)
            ->whereRaw('COALESCE(submitted_at, created_at) BETWEEN ? AND ?', [$from, $to])
            ->orderByRaw('COALESCE(submitted_at, created_at)')
            ->orderBy('id')
            ->get();

        $totals = $bills->groupBy(fn (ServiceProviderBill $b): string => $b->currency?->value ?? 'XOF')
            ->map(fn ($group): array => [
                'billed' => (float) $group->reject(fn (ServiceProviderBill $b) => in_array($b->status, self::NOT_BILLED, true))->sum('amount'),
                'paid' => (float) $group->filter(fn (ServiceProviderBill $b) => $b->status === ServiceProviderBillStatus::Paid)->sum('amount'),
            ])
            ->all();

        $locale = $user->preferredLocale() ?? app()->getLocale();
        $title = __('maintenance.bill_statement_pdf.title', [], $locale);

        return $pdf->stream('pdf.service-provider-bills.statement', [
            'bills' => $bills,
            'totals' => $totals,
            'provider' => $user,
            'from' => $from,
            'to' => $to,
            'agency' => null,
            'locale' => $locale,
            'title' => $title,
            'document_label' => $title,
        ], 'releve-factures-'.$from->format('Ymd').'-'.$to->format('Ymd').'.pdf');
    }
}
