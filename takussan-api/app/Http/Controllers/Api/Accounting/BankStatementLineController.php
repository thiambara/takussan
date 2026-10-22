<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\MatchBankStatementLineRequest;
use App\Http\Resources\Accounting\BankStatementLineResource;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Services\Accounting\ReconciliationManager;
use Illuminate\Http\Request;

class BankStatementLineController extends Controller
{
    private const PAYMENT_TYPE_MAP = [
        'booking_payment' => BookingPayment::class,
        'lease_payment' => LeasePayment::class,
        'invoice' => Invoice::class,
        'payout' => Payout::class,
    ];

    public function index(BankStatement $statement, Request $request)
    {
        $this->authorize('viewAny', [BankStatementLine::class, $statement]);

        $query = $statement->lines()->getQuery();

        // TCK-1294 (P118.01) — un ordre total à défaut de `sort=` : la date comptable, puis l'`id`.
        $paginator = BankStatementLine::buildQuery($query, $request)
            ->defaultSorts('posted_at', 'id')
            ->paginate();

        // TCK-1220 (P108.03) — l'enveloppe canonique `{ data, meta }`, et non celle de Laravel.
        return $this->paginated($paginator, BankStatementLineResource::collection($paginator)->toArray($request));
    }

    public function match(BankStatementLine $line, MatchBankStatementLineRequest $request, ReconciliationManager $manager)
    {
        $this->authorize('match', $line);

        $paymentClass = self::PAYMENT_TYPE_MAP[$request->validated('payment_type')];
        $payment = $paymentClass::findOrFail($request->validated('payment_id'));

        $updated = $manager->confirmMatch($line, $payment, $request->user());

        return BankStatementLineResource::make($updated);
    }

    public function unmatch(BankStatementLine $line, Request $request, ReconciliationManager $manager)
    {
        $this->authorize('unmatch', $line);

        $updated = $manager->unmatch($line, $request->user());

        return BankStatementLineResource::make($updated);
    }

    public function ignore(BankStatementLine $line, Request $request, ReconciliationManager $manager)
    {
        $this->authorize('ignore', $line);

        $updated = $manager->ignore($line, $request->user());

        return BankStatementLineResource::make($updated);
    }
}
