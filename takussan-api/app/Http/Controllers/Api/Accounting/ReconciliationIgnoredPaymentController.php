<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\IgnoreReconciliationPaymentRequest;
use App\Http\Requests\Accounting\ReconciliationIgnoredPaymentsRequest;
use App\Http\Resources\Accounting\ReconciliationIgnoredPaymentResource;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BookingPayment;
use App\Models\Enums\IgnoredPaymentReason;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\ReconciliationIgnoredPayment;
use App\Services\Accounting\IgnoredPaymentService;
use App\Services\Accounting\ReconciliationOverviewService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2932 — sortir du « reste à rapprocher » un paiement qui n'aura jamais de ligne de banque, et
 * l'y remettre ({@see IgnoredPaymentService}). Réservé à qui rapproche (`BankStatementPolicy::viewAny`).
 */
class ReconciliationIgnoredPaymentController extends Controller
{
    public function __construct(private readonly IgnoredPaymentService $service) {}

    /** `GET /api/agencies/{agency}/reconciliation/ignored-payments?period=YYYY-MM` — le plus récent d'abord. */
    public function index(ReconciliationIgnoredPaymentsRequest $request, Agency $agency): JsonResponse
    {
        $period = $request->periodOrNull();

        $paginator = ReconciliationIgnoredPayment::query()
            ->where('agency_id', $agency->id)
            // Les seuls gestes encore EN EFFET : le paiement serait au reste à rapprocher sans eux
            // (payé, hors passerelle, non rapproché, pas une caution rendue) — mêmes règles que la
            // synthèse, dont `ignored` est donc le total de cette liste sur le mois. Un paiement
            // ignoré puis rapproché n'y paraît plus.
            ->whereHasMorph('payable', array_values(ReconciliationOverviewService::PAYMENT_TYPES), function (Builder $p, string $type) use ($period): void {
                $table = $p->getModel()->getTable();
                $p->where("{$table}.status", PaymentStatus::Paid->value)
                    ->whereNotNull("{$table}.paid_at")
                    ->whereNull("{$table}.bank_reconciled_at")
                    ->whereRaw('NOT '.ReconciliationOverviewService::gatewaySettledSql($table));
                if ($type === LeasePayment::class) {
                    $p->exceptDepositRefunds();
                }
                if ($period !== null) {
                    [$from, $to] = ReconciliationOverviewService::bounds($period);
                    $p->where("{$table}.paid_at", '>=', $from)->where("{$table}.paid_at", '<', $to);
                }
            })
            ->with(['ignoredBy', 'payable' => fn (MorphTo $morph) => $morph->morphWith([
                LeasePayment::class => ['payer', 'lease.property'],
                BookingPayment::class => ['payer', 'booking.property'],
            ])])
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate($request->pageSize());

        $data = collect($paginator->items())
            ->map(fn (ReconciliationIgnoredPayment $row) => ReconciliationIgnoredPaymentResource::make($row)->resolve($request))
            ->all();

        return $this->paginated($paginator, $data);
    }

    /** `POST /api/agencies/{agency}/reconciliation/ignored-payments` */
    public function store(IgnoreReconciliationPaymentRequest $request, Agency $agency): JsonResponse
    {
        $row = $this->service->ignore(
            $agency,
            (string) $request->validated('payable_type'),
            (int) $request->validated('payable_id'),
            IgnoredPaymentReason::from((string) $request->validated('reason')),
            $request->validated('note'),
            $request->user(),
        );

        return $this->json(['data' => ReconciliationIgnoredPaymentResource::make($row->load(['ignoredBy', 'payable']))->resolve($request)], 201);
    }

    /** `DELETE /api/agencies/{agency}/reconciliation/ignored-payments/{ignoredPayment}` — défait le geste. */
    public function destroy(Agency $agency, ReconciliationIgnoredPayment $ignoredPayment): JsonResponse
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        // Le geste d'une autre agence : introuvable d'ici, comme un identifiant inconnu.
        if ((int) $ignoredPayment->agency_id !== (int) $agency->id) {
            abort_code(404, 'reconciliation.ignored_payment_not_found');
        }

        $this->service->unignore($ignoredPayment, request()->user());

        return $this->json(null, 204);
    }
}
