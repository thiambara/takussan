<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Accounting\MatchBankStatementLineRequest;
use App\Http\Resources\Accounting\BankStatementLineResource;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Services\Accounting\ReconciliationManager;
use Illuminate\Http\Request;

class BankStatementLineController extends Controller
{
    private const PAYMENT_TYPE_MAP = [
        'booking_payment' => BookingPayment::class,
        'lease_payment' => LeasePayment::class,
        'invoice' => Invoice::class,
    ];

    public function index(BankStatement $statement, Request $request)
    {
        $this->authorize('viewAny', [BankStatementLine::class, $statement]);

        $query = $statement->lines()->getQuery();

        return BankStatementLineResource::collection(
            BankStatementLine::buildQuery($query, $request)->paginate()
        );
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
