<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\ConfirmBankStatementLinesBatchRequest;
use App\Http\Requests\Accounting\MatchBankStatementLineRequest;
use App\Http\Requests\Accounting\SearchBankStatementLinesRequest;
use App\Http\Resources\Accounting\BankStatementLineResource;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Services\Accounting\ReconciliationManager;
use App\Services\Accounting\ReconciliationOverviewService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BankStatementLineController extends Controller
{
    private const PAYMENT_TYPE_MAP = [
        'booking_payment' => BookingPayment::class,
        'lease_payment' => LeasePayment::class,
        'invoice' => Invoice::class,
        'payout' => Payout::class,
        // TCK-1421 (P141.02) — le virement de clôture de la plateforme.
        'platform_payout' => PlatformPayout::class,
        // TCK-2793 (ADR-0039, amendement du 2026-11-14, point 5) — la pénalité payée seule d'une
        // échéance : la même ligne, sa seconde part.
        'lease_payment_late_fee' => LeasePayment::class,
    ];

    /**
     * TCK-1522 (P110.02) — le payable rapproché ou suggéré, réduit à son statut : la ligne le rend
     * (`matched_payment_status`), pour qu'un encaissement remboursé après rapprochement se voie.
     */
    private const PAYABLE = 'matchedPayment';

    public function index(BankStatement $statement, Request $request)
    {
        $this->authorize('viewAny', [BankStatementLine::class, $statement]);

        $query = $statement->lines()->getQuery();

        // TCK-1294 (P118.01) — un ordre total à défaut de `sort=` : la date comptable, puis l'`id`.
        $paginator = BankStatementLine::buildQuery($query, $request)
            ->defaultSorts('posted_at', 'id')
            ->paginate();

        $paginator->getCollection()->load(self::PAYABLE);

        // TCK-1220 (P108.03) — l'enveloppe canonique `{ data, meta }`, et non celle de Laravel.
        return $this->paginated($paginator, BankStatementLineResource::collection($paginator)->toArray($request));
    }

    /**
     * TCK-2674 — `GET /api/agencies/{agency}/bank-statement-lines` : chercher la ligne d'un paiement
     * dans les relevés de l'agence encore ouverts au rapprochement (ceux dont `match` confirme une
     * ligne). Filtres `match_status`, `direction`, `amount` (au franc près), `date_from` / `date_to`
     * (bornes comprises) ; tri `-posted_at` puis `id` à défaut.
     */
    public function search(SearchBankStatementLinesRequest $request, Agency $agency): JsonResponse
    {
        $filter = (array) ($request->validated('filter') ?? []);
        $query = BankStatementLine::query()
            ->whereHas('statement', fn (Builder $q) => $q
                ->where('agency_id', $agency->id)
                ->whereIn('status', array_map(fn ($s) => $s->value, ReconciliationOverviewService::OPEN_STATEMENT_STATUSES)))
            ->when($filter['match_status'] ?? null, fn (Builder $q, string $status) => $q->where('match_status', $status))
            ->when($filter['direction'] ?? null, fn (Builder $q, string $direction) => $q->where('direction', $direction))
            ->when(isset($filter['amount']), fn (Builder $q) => $q->whereRaw('ABS(amount - ?) < 1', [(float) $filter['amount']]))
            ->when($filter['date_from'] ?? null, fn (Builder $q, string $from) => $q->whereDate('posted_at', '>=', $from))
            ->when($filter['date_to'] ?? null, fn (Builder $q, string $to) => $q->whereDate('posted_at', '<=', $to));

        $sort = (string) ($request->validated('sort') ?? '-posted_at');
        $query->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc')->orderBy('id');

        $paginator = $query->paginate((int) ($request->validated('per_page') ?? 20));
        $paginator->getCollection()->load(self::PAYABLE);

        return $this->paginated($paginator, BankStatementLineResource::collection($paginator)->toArray($request));
    }

    /**
     * TCK-2674 — `POST /api/agencies/{agency}/bank-statement-lines/confirm-batch` : les lignes
     * proposées confirmées d'un geste, tout ou rien ({@see ReconciliationManager::confirmSuggestedBatch()}).
     */
    public function confirmBatch(ConfirmBankStatementLinesBatchRequest $request, Agency $agency, ReconciliationManager $manager): JsonResponse
    {
        $ids = $manager->confirmSuggestedBatch($agency, $request->validated('line_ids'), $request->user());

        return $this->json(['data' => ['line_ids' => $ids, 'count' => count($ids)]]);
    }

    public function match(BankStatementLine $line, MatchBankStatementLineRequest $request, ReconciliationManager $manager)
    {
        $this->authorize('match', $line);

        $type = $request->validated('payment_type');
        $paymentClass = self::PAYMENT_TYPE_MAP[$type];
        $payment = $paymentClass::findOrFail($request->validated('payment_id'));
        $part = $type === 'lease_payment_late_fee' ? LeasePayment::PART_LATE_FEE : null;

        $updated = $manager->confirmMatch($line, $payment, $request->user(), $part);

        return BankStatementLineResource::make($updated->load(self::PAYABLE));
    }

    public function unmatch(BankStatementLine $line, Request $request, ReconciliationManager $manager)
    {
        $this->authorize('unmatch', $line);

        $updated = $manager->unmatch($line, $request->user());

        return BankStatementLineResource::make($updated->load(self::PAYABLE));
    }

    public function ignore(BankStatementLine $line, Request $request, ReconciliationManager $manager)
    {
        $this->authorize('ignore', $line);

        $updated = $manager->ignore($line, $request->user());

        return BankStatementLineResource::make($updated->load(self::PAYABLE));
    }
}
