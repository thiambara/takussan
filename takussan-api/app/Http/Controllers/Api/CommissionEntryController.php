<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\CommissionEntryResource;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Services\Commission\CommissionLedgerService;
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

        return $this->paginated(
            $paginator,
            CommissionEntryResource::collection($paginator)->toArray($request),
            ['totals' => collect(CommissionEntryStatus::cases())
                ->mapWithKeys(fn (CommissionEntryStatus $s) => [$s->value => round((float) ($totals[$s->value] ?? 0), 2)])
                ->all()],
        );
    }

    public function markPaid(Request $request, CommissionEntry $commissionEntry): JsonResponse
    {
        $this->authorize('markPaid', $commissionEntry);

        $entry = $this->ledger->markPaid($commissionEntry, $request->user());

        return $this->json(['data' => CommissionEntryResource::make($entry)->toArray($request)]);
    }

    public function cancel(Request $request, CommissionEntry $commissionEntry): JsonResponse
    {
        $this->authorize('cancel', $commissionEntry);

        $entry = $this->ledger->cancel($commissionEntry, $request->user());

        return $this->json(['data' => CommissionEntryResource::make($entry)->toArray($request)]);
    }
}
