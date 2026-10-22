<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Support\Facades\DB;

class BookingPaymentService
{
    public function __construct(
        private readonly BookingRefundTaskService $refundTasks,
        private readonly PlatformPayoutService $platformPayouts,
    ) {}

    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Booking $booking, User $user, array $data): BookingPayment
    {
        $status = (isset($data['status']) && $data['status'] !== null && $data['status'] !== '')
            ? $data['status']
            : PaymentStatus::Paid->value;
        // Only stamp `paid_at` when the row is actually paid; otherwise leave
        // it null so the payment shows as pending/partial/etc. correctly.
        $isPaid = $status === PaymentStatus::Paid->value
            || ($status instanceof PaymentStatus && $status === PaymentStatus::Paid);

        return $booking->payments()->create([
            'payer_id' => $booking->customer_id,
            'collector_id' => $user->id,
            'reference_number' => ReferenceNumberGenerator::bookingPayment(),
            'receipt_number' => ReferenceNumberGenerator::receipt(),
            'amount' => $data['amount'],
            'currency' => $booking->currency?->value ?? 'XOF',
            'payment_type' => $data['payment_type'],
            'payment_method' => $data['payment_method'] ?? null,
            'status' => $status instanceof PaymentStatus ? $status->value : $status,
            'paid_at' => $isPaid ? ($data['paid_at'] ?? now()) : ($data['paid_at'] ?? null),
            'transaction_id' => $data['transaction_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * TCK-1309 (P133.05, décision du porteur) — ce que le client doit payer maintenant, dérivé par
     * l'API : l'acompte tant qu'aucun paiement n'est acquitté (s'il y en a un), sinon le reste dû
     * (total moins les lignes `paid`). Le navigateur faisait ce calcul et l'API écrivait son
     * résultat tel quel. Même règle que celle du navigateur, déplacée : les lignes
     * `partially_paid` et `refunded` ne comptent pas.
     *
     * @return array{0: float, 1: string} le montant et le `payment_type`
     */
    public function dueFromCustomer(Booking $booking): array
    {
        $paid = (float) $booking->payments()->where('status', PaymentStatus::Paid->value)->sum('amount');
        $remaining = max((float) $booking->total_amount - $paid, 0.0);
        abort_code_if($remaining <= 0, 422, 'booking_payment.nothing_due');

        $deposit = (float) $booking->deposit_amount;
        if ($paid <= 0 && $deposit > 0) {
            return [$deposit, BookingPaymentType::Deposit->value];
        }

        return [$remaining, BookingPaymentType::Advance->value];
    }

    /**
     * TCK-596 — la ligne du paiement est verrouillée puis relue : deux remboursements concurrents
     * du même acompte ne passent pas tous deux le contrôle `paid`. Le dernier paiement remboursé,
     * même en partie (TCK-1214), clôt la tâche « remboursement à traiter ».
     *
     * @param  array<string,mixed>  $data
     */
    public function refund(BookingPayment $payment, array $data): BookingPayment
    {
        $payment = DB::transaction(function () use ($payment, $data): BookingPayment {
            $payment = BookingPayment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            abort_code_unless(
                $payment->status === PaymentStatus::Paid,
                422,
                'booking_payment.refund_unpaid'
            );

            // TCK-1160 (P76.04) — un acompte soldé par une intégration de la PLATEFORME est chez
            // elle, et elle le reverse à l'agence à la clôture : son remboursement passe par le
            // fournisseur (webhook), jamais par une déclaration de l'agence.
            abort_code_if(
                $this->platformPayouts->isSettledByPlatform($payment),
                422,
                'booking_payment.refund_settled_by_platform'
            );

            // TCK-1214 (P76.02) — un remboursement partiel laisse l'acompte `paid` : le suivant
            // s'ajoute au premier, dans la limite du montant.
            $alreadyRefunded = (float) ($payment->refund_amount ?? 0);
            abort_code_if(
                $alreadyRefunded + (float) $data['refund_amount'] > (float) $payment->amount,
                422,
                'booking_payment.refund_exceeds_paid'
            );

            // TCK-596 — une devise sans sous-unité (XOF) ne rembourse pas 1 000,50.
            $currency = $payment->currency instanceof Currency ? $payment->currency : Currency::XOF;
            abort_code_if(
                $currency->decimalPlaces() === 0 && preg_match('/^\d+(\.0+)?$/', (string) $data['refund_amount']) !== 1,
                422,
                'booking_payment.refund_fractional'
            );

            // TCK-1214 (P76.02, option (b)) — seul un remboursement total passe l'acompte à
            // `refunded` ; un partiel le laisse `paid`, compté à `montant − refund_amount`.
            $refunded = $alreadyRefunded + (float) $data['refund_amount'];
            $payment->update([
                'status' => ($refunded >= (float) $payment->amount ? PaymentStatus::Refunded : PaymentStatus::Paid)->value,
                'refund_amount' => $refunded,
                'refund_reason' => $data['refund_reason'] ?? $payment->refund_reason,
            ]);

            return $payment->refresh();
        });

        $payment->loadMissing('booking');
        if ($payment->booking !== null) {
            $this->refundTasks->closeIfSettled($payment->booking);
        }

        return $payment;
    }
}
