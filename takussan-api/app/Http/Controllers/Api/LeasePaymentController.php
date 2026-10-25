<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MarkLateFeePaidRequest;
use App\Http\Requests\Api\MarkPaidLeasePaymentRequest;
use App\Http\Requests\Api\StoreLeasePaymentRequest;
use App\Http\Resources\LeasePaymentResource;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Lease\LateFeeSettlement;
use App\Services\Model\LeasePaymentService;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeasePaymentController extends Controller
{
    /** @var array<string, array{0: string, 1: 'asc'|'desc'}> */
    private const TRIS = [
        'due_date' => ['due_date', 'asc'],
        '-due_date' => ['due_date', 'desc'],
        'period_start' => ['period_start', 'asc'],
        '-period_start' => ['period_start', 'desc'],
    ];

    public function __construct(protected LeasePaymentService $payments) {}

    public function index(Request $request, Lease $lease): JsonResponse
    {
        // TCK-587 — la règle de `LeasePolicy::view`, à l'identique : l'ancien helper la recopiait.
        $this->authorize('view', $lease);

        // TCK-1178 (P100.01) — l'ordre que l'échéancier demande (`sort=due_date`) est honoré : trié
        // en dur par `period_start` décroissant, un bail de plus de 100 échéances perdait ses plus
        // anciennes, celles qui tombent en retard les premières. Un `sort` hors de cette liste garde
        // l'ordre d'avant ; l'`id` départage deux échéances de même date.
        // P216.04 (TCK-2126) — `sort[]=…` vaut l'ordre par défaut (TCK-1407), et n'est plus casté.
        $tri = ParametreUnique::chaine($request, 'sort');
        [$colonne, $sens] = ($tri !== null ? self::TRIS[$tri] ?? null : null) ?? ['period_start', 'desc'];

        $payments = $lease->payments()
            ->orderBy($colonne, $sens)
            ->orderBy('id', $sens)
            ->paginate($this->tailleDePage($request, 20));

        // TCK-593 — `amount_due` lit le réglage de l'agence du bail : un bail, une agence, chargés
        // une fois pour toute la page plutôt qu'une fois par échéance.
        $payments->getCollection()->each->setRelation('lease', $lease->loadMissing('agency'));

        return $this->paginated($payments, LeasePaymentResource::collection($payments)->toArray($request));
    }

    public function store(StoreLeasePaymentRequest $request, Lease $lease): JsonResponse
    {
        // P46.04 (TCK-957) — une ligne ne se pose que sur un bail qui court : actif, ou en préavis
        // (le loyer reste dû jusqu'à la date d'effet). Posée sur un brouillon, elle tenait lieu
        // d'échéancier à l'activation, et le bail n'avait plus aucun loyer.
        abort_code_unless(
            in_array($lease->status, [LeaseStatus::Active, LeaseStatus::Terminating], true),
            422,
            'lease_payment.lease_not_active',
        );

        $data = $request->validated();

        // TCK-1920 (P170.04, décision du porteur) — la route garde les charges, régularisations et
        // pénalités. Loyer et caution naissent de l'échéancier (`generate-schedule`) : posés ici,
        // ils prenaient tout montant et un second loyer sur une période déjà échue.
        abort_code_if(
            in_array($data['payment_type'], [LeasePaymentType::Rent->value, LeasePaymentType::Deposit->value], true),
            422,
            'lease_payment.type_from_schedule',
        );

        $payment = $this->payments->create($lease, $request->user(), $data);

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->resolve($request),
        ], 201);
    }

    public function markPaid(MarkPaidLeasePaymentRequest $request, LeasePayment $payment): JsonResponse
    {
        $payment->loadMissing('lease');
        abort_unless($payment->lease, 404);

        $data = $request->validated();

        $payment = $this->payments->markPaid($payment, $data, $request->user());

        return $this->json([
            'data' => LeasePaymentResource::make($payment)->resolve($request),
        ]);
    }

    /**
     * TCK-593 — l'agence enregistre une pénalité de retard réglée chez elle. 409
     * `late_fee_not_due` s'il n'en reste aucune.
     */
    public function markLateFeePaid(MarkLateFeePaidRequest $request, LeasePayment $payment, LateFeeSettlement $settlement): JsonResponse
    {
        $payment = $settlement->markPaid($payment, $request->user(), $request->validated());

        return $this->json([
            'data' => LeasePaymentResource::make($payment->refresh())->resolve($request),
        ]);
    }
}
