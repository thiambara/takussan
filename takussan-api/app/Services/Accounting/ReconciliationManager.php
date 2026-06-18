<?php

namespace App\Services\Accounting;

use App\Events\Accounting\BankStatementFinalized;
use App\Events\Accounting\BankStatementLineMatched;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReconciliationManager
{
    private const ALLOWED_PAYMENT_TYPES = [
        BookingPayment::class,
        LeasePayment::class,
        Invoice::class,
    ];

    public function __construct(private readonly Dispatcher $events) {}

    /**
     * Confirm a match between a bank statement line and a payment.
     */
    public function confirmMatch(BankStatementLine $line, Model $payment, User $caller): BankStatementLine
    {
        $statement = $line->statement;

        // Guard: statement must be open for review
        if (! in_array($statement->status, [BankStatementStatus::ReadyForReview, BankStatementStatus::PartiallyReconciled], true)) {
            throw ValidationException::withMessages([
                'statement' => [__('reconciliation.validation.statement_closed')],
            ]);
        }

        // Guard: same agency
        if ($this->resolvePaymentAgencyId($payment) !== $statement->agency_id) {
            abort(403, __('reconciliation.validation.cross_agency'));
        }

        // Guard: currency match
        $paymentCurrency = $payment->currency instanceof \BackedEnum ? $payment->currency->value : $payment->currency;
        if ($line->currency !== $paymentCurrency) {
            throw ValidationException::withMessages([
                'currency' => [__('reconciliation.validation.currency_mismatch', [
                    'line' => $line->currency,
                    'payment' => $paymentCurrency,
                ])],
            ]);
        }

        // Guard: not already reconciled
        if ($payment->bank_statement_line_id !== null) {
            throw ValidationException::withMessages([
                'payment' => [__('reconciliation.validation.already_reconciled')],
            ]);
        }

        // Guard: valid payment type
        if (! in_array(get_class($payment), self::ALLOWED_PAYMENT_TYPES, true)) {
            abort(422, 'Unsupported payment type.');
        }

        $line = DB::transaction(function () use ($line, $payment, $caller) {
            // Lock the line to prevent concurrent updates. Use findOrFail: the
            // row may have been deleted between the initial fetch and the lock,
            // and the unguarded `find()` would then fatal on `$locked->...`.
            $locked = BankStatementLine::query()->lockForUpdate()->findOrFail($line->id);

            // Re-verify after lock — another concurrent caller may have already
            // confirmed or ignored this line.
            if (in_array($locked->match_status, [
                BankStatementLineMatchStatus::Confirmed,
                BankStatementLineMatchStatus::Ignored,
            ], true)) {
                throw ValidationException::withMessages([
                    'line' => [__('reconciliation.validation.already_reconciled')],
                ]);
            }

            $payment->refresh();
            if ($payment->bank_statement_line_id !== null) {
                throw ValidationException::withMessages([
                    'payment' => [__('reconciliation.validation.already_reconciled')],
                ]);
            }

            $locked->update([
                'match_status' => BankStatementLineMatchStatus::Confirmed,
                'matched_payment_type' => get_class($payment),
                'matched_payment_id' => $payment->id,
                'confirmed_at' => now(),
                'confirmed_by' => $caller->id,
            ]);

            $payment->update([
                'bank_reconciled_at' => $locked->posted_at,
                'bank_statement_line_id' => $locked->id,
            ]);

            return $locked;
        });

        activity('BankStatementLine')
            ->causedBy($caller)
            ->performedOn($line)
            ->withProperties([
                'payment_type' => get_class($payment),
                'payment_id' => $payment->id,
                'match_confidence' => $line->match_confidence,
            ])
            ->event('matched')
            ->log('matched');

        $this->events->dispatch(new BankStatementLineMatched($line));

        return $line;
    }

    /**
     * Remove a match, freeing the payment for re-matching.
     */
    public function unmatch(BankStatementLine $line, User $caller): BankStatementLine
    {
        $statement = $line->statement;

        if ($statement->status->isClosed()) {
            throw ValidationException::withMessages([
                'statement' => [__('reconciliation.validation.statement_closed')],
            ]);
        }

        DB::transaction(function () use ($line) {
            $payment = $line->matchedPayment;

            if ($payment !== null) {
                $payment->update([
                    'bank_reconciled_at' => null,
                    'bank_statement_line_id' => null,
                ]);
            }

            $line->update([
                'match_status' => BankStatementLineMatchStatus::Unmatched,
                'matched_payment_type' => null,
                'matched_payment_id' => null,
                'confirmed_at' => null,
                'confirmed_by' => null,
            ]);
        });

        activity('BankStatementLine')
            ->causedBy($caller)
            ->performedOn($line)
            ->event('unmatched')
            ->log('unmatched');

        return $line->refresh();
    }

    /**
     * Mark a line as ignored. If confirmed, unmatch first.
     */
    public function ignore(BankStatementLine $line, User $caller): BankStatementLine
    {
        $statement = $line->statement;

        if ($statement->status->isClosed()) {
            throw ValidationException::withMessages([
                'statement' => [__('reconciliation.validation.statement_closed')],
            ]);
        }

        DB::transaction(function () use ($line) {
            // If confirmed, unmatch first to free the payment
            if ($line->match_status === BankStatementLineMatchStatus::Confirmed) {
                $payment = $line->matchedPayment;
                if ($payment !== null) {
                    $payment->update([
                        'bank_reconciled_at' => null,
                        'bank_statement_line_id' => null,
                    ]);
                }
            }

            $line->update([
                'match_status' => BankStatementLineMatchStatus::Ignored,
                'matched_payment_type' => null,
                'matched_payment_id' => null,
                'confirmed_at' => null,
                'confirmed_by' => null,
            ]);
        });

        activity('BankStatementLine')
            ->causedBy($caller)
            ->performedOn($line)
            ->event('ignored')
            ->log('ignored');

        return $line->refresh();
    }

    /**
     * Finalize (close) a bank statement.
     */
    public function finalize(BankStatement $statement, User $caller): BankStatement
    {
        if (! in_array($statement->status, [BankStatementStatus::ReadyForReview, BankStatementStatus::PartiallyReconciled], true)) {
            throw ValidationException::withMessages([
                'statement' => [__('reconciliation.validation.statement_closed')],
            ]);
        }

        $remaining = $statement->lines()
            ->whereIn('match_status', [
                BankStatementLineMatchStatus::Unmatched->value,
                BankStatementLineMatchStatus::Suggested->value,
            ])
            ->count();

        $newStatus = $remaining === 0
            ? BankStatementStatus::Reconciled
            : BankStatementStatus::PartiallyReconciled;

        $statement->update([
            'status' => $newStatus,
            'finalized_at' => now(),
            'finalized_by' => $caller->id,
        ]);

        activity('BankStatement')
            ->causedBy($caller)
            ->performedOn($statement)
            ->withProperties(['status' => $newStatus->value])
            ->event('finalized')
            ->log('finalized');

        $this->events->dispatch(new BankStatementFinalized($statement));

        return $statement->refresh();
    }

    private function resolvePaymentAgencyId(Model $payment): ?int
    {
        if ($payment instanceof Invoice) {
            return $payment->agency_id;
        }

        if ($payment instanceof LeasePayment) {
            return $payment->lease?->agency_id;
        }

        if ($payment instanceof BookingPayment) {
            return $payment->booking?->property?->agency_id;
        }

        return null;
    }
}
