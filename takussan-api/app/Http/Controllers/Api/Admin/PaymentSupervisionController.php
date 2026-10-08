<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\IndexPaymentSupervisionRequest;
use App\Services\Admin\PaymentSupervisionService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

/**
 * TCK-602 — la console « Paiements » : les paiements en échec ou en retard (échéances et acomptes),
 * et les compteurs par fournisseur. La définition de « en échec » vit dans
 * {@see PaymentSupervisionService}, une seule fois.
 */
class PaymentSupervisionController extends Controller
{
    public function __construct(private readonly PaymentSupervisionService $supervision) {}

    public function index(IndexPaymentSupervisionRequest $request): JsonResponse
    {
        $filter = (array) $request->validated('filter', []);
        $to = isset($filter['to']) ? CarbonImmutable::parse($filter['to'])->endOfDay() : CarbonImmutable::now();
        $from = isset($filter['from']) ? CarbonImmutable::parse($filter['from'])->startOfDay() : $to->subDays(30);

        $paginator = $this->supervision->list(
            [
                'status' => $filter['status'] ?? null,
                'provider' => $filter['provider'] ?? null,
                'agency_id' => isset($filter['agency_id']) ? (int) $filter['agency_id'] : null,
            ],
            $from,
            $to,
            (int) $request->validated('per_page', 25),
        );

        $rows = collect($paginator->items())->map(fn (object $row): array => [
            'type' => $row->type,
            'reason' => $row->reason,
            'id' => (int) $row->id,
            'reference_number' => $row->reference_number,
            'status' => $row->status,
            'provider' => $row->provider,
            'amount' => $row->amount !== null ? (float) $row->amount : null,
            'currency' => $row->currency,
            'agency_id' => $row->agency_id !== null ? (int) $row->agency_id : null,
            'event_at' => $row->event_at !== null ? CarbonImmutable::parse($row->event_at)->toIso8601String() : null,
            'due_date' => $row->due_date !== null ? CarbonImmutable::parse($row->due_date)->toDateString() : null,
        ])->all();

        return $this->paginated($paginator, $rows);
    }

    public function summary(): JsonResponse
    {
        return $this->json(['data' => $this->supervision->summary(CarbonImmutable::now())]);
    }
}
