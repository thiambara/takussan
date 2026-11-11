<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\ReconciliationOverviewRequest;
use App\Http\Requests\Accounting\ReconciliationPendingPaymentsRequest;
use App\Http\Resources\Accounting\ReconciliationPendingPaymentResource;
use App\Models\Agency;
use App\Services\Accounting\ReconciliationOverviewService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2674 — le rapprochement vu par paiement ({@see ReconciliationOverviewService}) : la synthèse
 * du mois, et les paiements qui restent à rapprocher avec leur ligne proposée. Réservé à qui
 * rapproche (`BankStatementPolicy::viewAny`, jugée par les FormRequest).
 */
class ReconciliationOverviewController extends Controller
{
    public function __construct(private readonly ReconciliationOverviewService $service) {}

    /** `GET /api/agencies/{agency}/reconciliation/overview?period=YYYY-MM` */
    public function overview(ReconciliationOverviewRequest $request, Agency $agency): JsonResponse
    {
        return $this->json(['data' => $this->service->overview($agency, $request->period())]);
    }

    /** `GET /api/agencies/{agency}/reconciliation/pending-payments` — tri `-amount`. */
    public function pendingPayments(ReconciliationPendingPaymentsRequest $request, Agency $agency): JsonResponse
    {
        $result = $this->service->pendingPayments(
            $agency,
            $request->period(),
            $request->methods(),
            $request->hasSuggestion(),
            $request->pageSize(),
        );

        $data = $result['payments']->map(fn (Model $payment) => ReconciliationPendingPaymentResource::make($payment)
            ->withSuggestion($result['suggestions']->get($payment::class.':'.$payment->getKey()))
            ->resolve($request))->all();

        return $this->paginated($result['paginator'], $data);
    }
}
