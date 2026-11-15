<?php

namespace App\Services\Accounting;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\IgnoredPaymentReason;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\ReconciliationIgnoredPayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2932 — sortir un paiement du « reste à rapprocher » quand il n'aura jamais de ligne de banque,
 * et l'y remettre.
 *
 * **Rien d'autre ne change** : le paiement n'est ni écrit ni touché (aucun `update`, aucun `touch`,
 * donc aucun observateur), ni sa quittance, ni un reversement, ni un solde. Seule la ligne de
 * `reconciliation_ignored_payments` naît ou disparaît, et chaque geste est journalisé SUR LE
 * PAIEMENT (`payment_ignored`, `payment_unignored`) : qui, quand, motif. Le classement qui en
 * découle est lu par {@see ReconciliationOverviewService::paidInPeriod()}.
 */
final class IgnoredPaymentService
{
    /** Le paiement `$type`/`$id` de l'agence, ou `null` (absent, ou d'une autre agence). */
    public function find(Agency $agency, string $type, int $id, bool $lock = false): ?Model
    {
        $class = ReconciliationOverviewService::PAYMENT_TYPES[$type] ?? null;
        if ($class === null) {
            return null;
        }

        $relation = $class === LeasePayment::class ? 'lease' : 'booking';

        return $class::query()
            ->whereKey($id)
            ->whereHas($relation, fn (Builder $q) => $q->where('agency_id', $agency->id))
            ->when($lock, fn (Builder $q) => $q->lockForUpdate())
            ->first();
    }

    /**
     * Le paiement est-il de ceux que la liste du reste à rapprocher porterait (hors période) : payé,
     * hors passerelle, non rapproché, et pas une caution rendue. Mêmes règles que `paidInPeriod()`.
     */
    public function isToReconcile(Model $payment): bool
    {
        $table = $payment->getTable();

        return $payment::query()
            ->whereKey($payment->getKey())
            ->where("{$table}.status", PaymentStatus::Paid->value)
            ->whereNotNull("{$table}.paid_at")
            ->whereNull("{$table}.bank_reconciled_at")
            ->whereRaw('NOT '.ReconciliationOverviewService::gatewaySettledSql($table))
            ->when($payment instanceof LeasePayment, fn (Builder $q) => $q->exceptDepositRefunds())
            ->exists();
    }

    public function ignore(Agency $agency, string $type, int $id, IgnoredPaymentReason $reason, ?string $note, User $caller): ReconciliationIgnoredPayment
    {
        return DB::transaction(function () use ($agency, $type, $id, $reason, $note, $caller): ReconciliationIgnoredPayment {
            // Le paiement verrouillé : deux envois du même geste se suivent au lieu de heurter
            // l'index unique `(payable_type, payable_id)` en 500.
            $payment = $this->find($agency, $type, $id, lock: true);
            if ($payment === null) {
                abort_code(404, 'reconciliation.payment_not_found');
            }

            if (ReconciliationIgnoredPayment::query()->where('payable_type', $payment::class)->where('payable_id', $payment->getKey())->exists()) {
                abort_code(422, 'reconciliation.payment_already_ignored');
            }

            if (! $this->isToReconcile($payment)) {
                abort_code(422, 'reconciliation.payment_not_pending');
            }

            $row = ReconciliationIgnoredPayment::query()->create([
                'agency_id' => $agency->id,
                'payable_type' => $payment::class,
                'payable_id' => $payment->getKey(),
                'reason' => $reason,
                'note' => $note,
                'ignored_by_id' => $caller->id,
            ]);

            activity($this->logName($payment))
                ->causedBy($caller)
                ->performedOn($payment)
                ->withProperties(['ignored_payment_id' => $row->id, 'reason' => $reason->value, 'note' => $note])
                ->event('payment_ignored')
                ->log('payment_ignored');

            return $row;
        });
    }

    public function unignore(ReconciliationIgnoredPayment $row, User $caller): void
    {
        DB::transaction(function () use ($row, $caller): void {
            $payment = $row->payable;
            $row->delete();

            if ($payment !== null) {
                activity($this->logName($payment))
                    ->causedBy($caller)
                    ->performedOn($payment)
                    ->withProperties(['ignored_payment_id' => $row->id, 'reason' => $row->reason->value, 'note' => $row->note])
                    ->event('payment_unignored')
                    ->log('payment_unignored');
            }
        });
    }

    private function logName(Model $payment): string
    {
        return $payment instanceof BookingPayment ? 'BookingPayment' : 'LeasePayment';
    }
}
