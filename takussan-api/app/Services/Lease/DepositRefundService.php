<?php

namespace App\Services\Lease;

use App\Events\Lease\LeaseDepositRefunded;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use App\Services\Model\ReferenceNumberGenerator;
use Illuminate\Support\Facades\DB;

/**
 * TCK-088 — Caution refund at lease end.
 *
 * Single-shot operation: a lease's deposit is refunded once (totally or
 * partially). Any retained portion is captured via `reason` + (optionally)
 * an Invoice line item; the cash actually returned to the tenant flows
 * through a `Payout` outflow. Once `deposit_refunded_at` is set and
 * `deposit_remaining` is zero, the operation is locked (idempotency).
 *
 * The legacy `deposit_refund` LeasePayment row created by the previous
 * implementation is preserved to keep TCK-027 receipts/journal coherent.
 */
class DepositRefundService
{
    /**
     * @param  array<string,mixed>  $data  amount, reason?, attachments?: list<int>
     * @return array{lease: Lease, payment: LeasePayment, payout: Payout, invoice: ?Invoice}
     */
    public function refund(Lease $lease, User $issuedBy, array $data): array
    {
        // Cheap pre-flight: status / non-zero deposit / amount shape don't
        // change under contention so they're worth failing fast on.
        abort_unless(
            in_array($lease->status, [LeaseStatus::Terminated, LeaseStatus::Expired], true),
            422,
            __('messages.lease_must_be_ended_for_refund')
        );

        $deposit = (float) ($lease->deposit_amount ?? 0);
        abort_if($deposit <= 0, 422, __('messages.no_deposit_to_refund'));

        $amount = round((float) ($data['amount'] ?? 0), 2);
        abort_if($amount <= 0, 422, __('messages.refund_amount_required'));

        $reason = isset($data['reason']) ? trim((string) $data['reason']) : '';
        $currency = $lease->currency?->value ?? 'XOF';

        return DB::transaction(function () use ($lease, $issuedBy, $amount, $reason, $currency, $data) {
            // Re-fetch under a row lock so two concurrent partial refunds can't
            // each observe `deposit_refunded_amount=0` and over-credit the
            // tenant. The remaining-amount and partial-vs-full checks are
            // evaluated against the locked state, not the stale input.
            $lease = Lease::query()
                ->whereKey($lease->id)
                ->lockForUpdate()
                ->firstOrFail();

            $remaining = (float) $lease->deposit_remaining;
            abort_if($remaining <= 0, 422, __('messages.deposit_already_refunded'));
            abort_if(
                $amount > $remaining + 0.001,
                422,
                __('messages.refund_amount_exceeds_remaining')
            );

            $isPartial = $amount + 0.001 < $remaining;
            abort_if($isPartial && $reason === '', 422, __('messages.refund_reason_required_for_partial'));

            $retained = round($remaining - $amount, 2);
            $now = now();

            $payment = LeasePayment::create([
                'lease_id' => $lease->id,
                'reference_number' => ReferenceNumberGenerator::leasePayment(),
                'payer_id' => $lease->tenant_id,
                'collector_id' => $issuedBy->id,
                'payment_type' => LeasePaymentType::DepositRefund->value,
                'amount' => $amount,
                'currency' => $currency,
                'status' => PaymentStatus::Pending,
                'due_date' => $now->copy()->addDays(30)->toDateString(),
                'period_start' => $now->toDateString(),
                'period_end' => $now->copy()->addDays(30)->toDateString(),
                'notes' => $reason !== '' ? $reason : null,
            ]);

            $payout = Payout::create([
                'lease_id' => $lease->id,
                'agency_id' => $lease->agency_id,
                'landlord_id' => $lease->landlord_id,
                'issued_by_id' => $issuedBy->id,
                'reference_number' => ReferenceNumberGenerator::payout(),
                'status' => PayoutStatus::Pending->value,
                'period_start' => $now->toDateString(),
                'period_end' => $now->toDateString(),
                'gross_amount' => $amount,
                'commission_amount' => 0,
                'net_amount' => $amount,
                'currency' => $currency,
                'notes' => __('messages.deposit_refund_payout_note', [
                    'reference' => $lease->reference_number,
                ]),
            ]);

            $invoice = null;
            if ($retained > 0 && $lease->tenant_id) {
                $invoice = Invoice::create([
                    'invoiceable_type' => Lease::class,
                    'invoiceable_id' => $lease->id,
                    'customer_id' => $lease->tenant_id,
                    'issued_by_id' => $issuedBy->id,
                    'agency_id' => $lease->agency_id,
                    'reference_number' => ReferenceNumberGenerator::invoice(),
                    'status' => InvoiceStatus::Draft->value,
                    'issue_date' => $now->toDateString(),
                    'due_date' => $now->copy()->addDays(30)->toDateString(),
                    'subtotal' => $retained,
                    'tax_rate' => 0,
                    'tax_amount' => 0,
                    'total_amount' => $retained,
                    'currency' => $currency,
                    'notes' => __('messages.deposit_retention_invoice_line', [
                        'reason' => $reason,
                    ]),
                ]);
            }

            $totalRefunded = round((float) ($lease->deposit_refunded_amount ?? 0) + $amount, 2);
            $lease->forceFill([
                'deposit_refunded_amount' => $totalRefunded,
                'deposit_refunded_at' => $now,
                'deposit_refund_reason' => $reason !== '' ? $reason : $lease->deposit_refund_reason,
            ])->save();

            $attachments = $data['attachments'] ?? [];
            foreach ($attachments as $mediaId) {
                $lease->media()
                    ->where('id', $mediaId)
                    ->update(['collection_name' => 'lease_deposit_refund']);
            }

            $uploads = $data['uploads'] ?? [];
            foreach ($uploads as $upload) {
                $lease->addMedia($upload)->toMediaCollection('lease_deposit_refund');
            }

            activity('Lease')
                ->performedOn($lease)
                ->causedBy($issuedBy)
                ->withProperties([
                    'refunded' => $amount,
                    'retained' => $retained,
                    'reason' => $reason !== '' ? $reason : null,
                    'payout_id' => $payout->id,
                    'invoice_id' => $invoice?->id,
                ])
                ->event('deposit_refunded')
                ->log('deposit_refunded');

            $lease->refresh();
            LeaseDepositRefunded::dispatch($lease, $payment, $payout, $invoice, $amount, $retained, $reason);

            return [
                'lease' => $lease,
                'payment' => $payment->fresh(),
                'payout' => $payout->fresh(),
                'invoice' => $invoice?->fresh(),
            ];
        });
    }

    /**
     * Read-only state of the deposit refund flow for a given lease.
     *
     * @return array{
     *     deposit_amount: float,
     *     deposit_refunded_amount: float,
     *     deposit_remaining: float,
     *     deposit_refunded_at: ?string,
     *     deposit_refund_reason: ?string,
     *     state: 'none'|'partial'|'full',
     *     attachments: list<array{id:int,name:string,url:string}>,
     * }
     */
    public function state(Lease $lease): array
    {
        $deposit = (float) ($lease->deposit_amount ?? 0);
        $refunded = (float) ($lease->deposit_refunded_amount ?? 0);
        $remaining = (float) $lease->deposit_remaining;

        $state = 'none';
        if ($refunded > 0 && $remaining <= 0.001) {
            $state = 'full';
        } elseif ($refunded > 0) {
            $state = 'partial';
        }

        $attachments = $lease->getMedia('lease_deposit_refund')
            ->map(fn ($media) => [
                'id' => $media->id,
                'name' => $media->name,
                'url' => $media->getFullUrl(),
            ])
            ->values()
            ->all();

        return [
            'deposit_amount' => $deposit,
            'deposit_refunded_amount' => $refunded,
            'deposit_remaining' => $remaining,
            'deposit_refunded_at' => $lease->deposit_refunded_at?->toISOString(),
            'deposit_refund_reason' => $lease->deposit_refund_reason,
            'state' => $state,
            'attachments' => $attachments,
        ];
    }
}
