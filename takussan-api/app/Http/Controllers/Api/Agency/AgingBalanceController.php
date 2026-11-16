<?php

namespace App\Http\Controllers\Api\Agency;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use App\Services\Reporting\AgingBalanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * TCK-595 (§7, AD17) — `GET /api/agencies/{agency}/finance/aging?group_by=tenant|landlord`.
 *
 * Chiffres consolidés de l'agence : `reports.view_agency` à l'agence (`AgencyPolicy::viewReports`).
 * Ouvert à une agence `individual` : l'hôte suit ses impayés comme une agence, ce n'est pas un
 * reporting cross-équipe.
 *
 * TCK-2866 — `filter[landlord_id]` (ou `landlord_id`) : la balance d'un seul bailleur de l'agence ;
 * et `GET …/finance/aging.pdf`, la MÊME lecture ({@see AgingBalanceService::forAgency()}, mêmes
 * tranches, mêmes montants, même filtre) imprimée, sous la même garde.
 */
class AgingBalanceController extends Controller
{
    public function __construct(
        private readonly AgingBalanceService $service,
        private readonly DocumentPdfService $pdf,
    ) {}

    public function show(Request $request, Agency $agency): JsonResponse
    {
        $this->authorize('viewReports', $agency);

        return $this->json(['data' => $this->service->forAgency($agency, $this->groupBy($request), $this->landlordId($request))]);
    }

    /** TCK-2866 — la balance âgée en PDF, à envoyer au bailleur. */
    public function pdf(Request $request, Agency $agency): Response
    {
        $this->authorize('viewReports', $agency);

        $landlordId = $this->landlordId($request);
        $balance = $this->service->forAgency($agency, $this->groupBy($request), $landlordId);
        $landlord = $landlordId !== null ? User::query()->withTrashed()->find($landlordId) : null;
        $title = __('aged_balance.title');

        return $this->pdf->stream('pdf.reports.aged-balance', [
            'title' => $title,
            'document_label' => $title,
            'agency' => $agency,
            'balance' => $balance,
            'landlord_name' => $landlord?->nameWithoutContact(),
        ], sprintf('balance-agee-%s%s.pdf', $balance['as_of'], $landlordId !== null ? "-{$landlordId}" : ''));
    }

    private function groupBy(Request $request): string
    {
        $groupBy = $request->query('group_by', AgingBalanceService::GROUP_TENANT);
        abort_code_unless(
            in_array($groupBy, [AgingBalanceService::GROUP_TENANT, AgingBalanceService::GROUP_LANDLORD], true),
            422,
            'reporting.invalid_group_by',
        );

        return $groupBy;
    }

    /** TCK-2866 — un identifiant entier, ou rien ; une liste ou un texte : 422. */
    private function landlordId(Request $request): ?int
    {
        $filter = $request->query('filter');
        $value = (is_array($filter) ? ($filter['landlord_id'] ?? null) : null) ?? $request->query('landlord_id');
        if ($value === null || $value === '') {
            return null;
        }
        abort_code_unless(is_string($value) && ctype_digit($value) && strlen($value) <= 18, 422, 'reporting.invalid_landlord');

        return (int) $value;
    }
}
