<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Commissions\CancelCommissionRequest;
use App\Http\Requests\Api\Commissions\CommissionSummaryRequest;
use App\Http\Requests\Api\Commissions\MarkCommissionPaidRequest;
use App\Http\Requests\Api\Commissions\SettleCommissionsRequest;
use App\Http\Resources\CommissionEntryResource;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Services\Commission\CommissionLedgerService;
use App\Services\Commission\CommissionSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-595 (ADR-0049 §3) — le relevé des commissions et les deux gestes de l'admin.
 *
 * Le grand livre est interne à l'agence du profil actif : un membre du personnel y lit ses lignes,
 * et toutes celles de l'agence s'il détient `reports.view_agency` (`AgencyPolicy::viewReports`).
 * Hors personnel (bailleur, client), 403. `meta.totals` somme le périmètre lu, par statut, pour le
 * relevé : la page ne peut pas le recalculer depuis une page de résultats.
 */
class CommissionEntryController extends Controller
{
    public function __construct(private readonly CommissionLedgerService $ledger) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if(! $user->isSuperAdmin() && $user->staffAgencyId() === null, 403);
        $base = CommissionEntry::query()->visibleTo($user);

        $totals = (clone $base)
            ->toBase()
            ->selectRaw('status, COALESCE(SUM(amount), 0) AS total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $paginator = CommissionEntry::buildQuery($base, $request)
            ->defaultSort('-earned_at')
            ->paginate();

        // TCK-2661 — `include=lease.property` rend le quartier du bien : son adresse, en une requête.
        if (in_array('lease.property', explode(',', (string) $request->query('include', '')), true)) {
            $paginator->getCollection()->loadMissing('lease.property.address');
        }

        return $this->paginated(
            $paginator,
            CommissionEntryResource::collection($paginator)->toArray($request),
            ['totals' => collect(CommissionEntryStatus::cases())
                ->mapWithKeys(fn (CommissionEntryStatus $s) => [$s->value => round((float) ($totals[$s->value] ?? 0), 2)])
                ->all()],
        );
    }

    /** TCK-2661 — la date, le moyen et la référence du paiement ; le bénéficiaire en est avisé. */
    public function markPaid(MarkCommissionPaidRequest $request, CommissionEntry $commissionEntry): JsonResponse
    {
        // TCK-2661 — transition, retiré par TCK-2662 : corps vide → le geste d'avant, sans preuve ni avis.
        if ($request->isTransitionalEmptyBody()) {
            $entry = $this->ledger->markPaid($commissionEntry, $request->user());

            return $this->json(['data' => CommissionEntryResource::make($entry)->resolve($request)]);
        }

        $entry = $this->ledger->markPaid($commissionEntry, $request->user(), $request->validated());
        $this->ledger->notifyPaid([$entry]);

        return $this->json(['data' => CommissionEntryResource::make($entry)->resolve($request)]);
    }

    /** TCK-2661 — le motif de l'annulation, lu par le bénéficiaire sur sa ligne. */
    public function cancel(CancelCommissionRequest $request, CommissionEntry $commissionEntry): JsonResponse
    {
        // TCK-2661 — transition, retiré par TCK-2662 : corps vide → `validated()` vide → annulée sans
        // motif, le geste d'avant.
        $entry = $this->ledger->cancel($commissionEntry, $request->user(), $request->validated());

        return $this->json(['data' => CommissionEntryResource::make($entry)->resolve($request)]);
    }

    /**
     * TCK-2661 — `POST /api/commissions/settle` : les lignes dues d'un bénéficiaire, payées en une fois
     * (toutes ou aucune), à l'agence du profil actif.
     */
    public function settle(SettleCommissionsRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $entries = $this->ledger->settle(
            $request->user()->activeProfile()?->agency_id,
            (int) $validated['beneficiary_id'],
            $validated['entry_ids'],
            $request->user(),
            $validated,
        );
        $this->ledger->notifyPaid($entries);

        return $this->json(['data' => CommissionEntryResource::collection($entries)->resolve($request)]);
    }

    /**
     * TCK-2661 — `GET /api/commissions/summary?year=YYYY&month=YYYY-MM` : le point par bénéficiaire
     * (mois et année de Dakar ; par défaut, le mois courant et son année).
     */
    public function summary(CommissionSummaryRequest $request, CommissionSummaryService $summaries): JsonResponse
    {
        $validated = $request->validated();
        $month = $validated['month'] ?? now(CommissionEntry::DATE_TIMEZONE)->format('Y-m');
        $year = $validated['year'] ?? substr($month, 0, 4);

        $rows = array_map(fn (array $row): array => [
            ...$row,
            'oldest_due_earned_at' => $this->instant($row['oldest_due_earned_at']),
            'last_paid' => $row['last_paid'] !== null ? ['at' => $this->instant($row['last_paid']['at']), 'method' => $row['last_paid']['method']] : null,
        ], $summaries->forUser($request->user(), $month, $year));

        return $this->json(['data' => $rows, 'meta' => ['month' => $month, 'year' => $year]]);
    }
}
