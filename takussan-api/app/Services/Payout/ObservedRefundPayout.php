<?php

namespace App\Services\Payout;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Model\ReferenceNumberGenerator;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2052 (P110.01, ADR-0039 amendement du 2026-10-23) — le `Payout` « constaté » d'un
 * remboursement d'acompte ou de loyer déjà sorti. Le débit du relevé bancaire ne se rapproche que
 * d'un `Payout` `completed` : sans lui, le débit d'un remboursement n'avait rien à quoi se
 * rapprocher, et le relevé ne se clôturait plus `reconciled`.
 *
 * À appeler DANS la transaction qui écrit le remboursement sur le payable (point 1). Le constaté :
 * - naît `completed`, hors du seuil d'approbation et des trois gestes (point 2) ;
 * - est `tenant`, `landlord_id` = bailleur du bail, ou du bien de la réservation (point 3) ;
 * - porte le montant de CE remboursement, brut = net, sans commission (point 4) ;
 * - ne s'attache à aucun pivot (point 7) ;
 * - désigne le payable par `refunded_payment_type` / `refunded_payment_id` (point 8).
 * Un payable encaissé par une intégration de la plateforme n'en donne pas (point 9) : l'argent sort
 * du compte de la plateforme, le relevé de l'agence ne porte aucun débit.
 */
final class ObservedRefundPayout
{
    public function __construct(private readonly PlatformPayoutService $platformPayouts) {}

    public function record(LeasePayment|BookingPayment $payment, float $amount, CarbonInterface $at, ?int $issuedById = null): ?Payout
    {
        if ($amount <= 0 || $this->platformPayouts->isSettledByPlatform($payment)) {
            return null;
        }

        [$agencyId, $landlordId, $leaseId, $bookingId] = $this->parties($payment);
        if ($landlordId === null) {
            // `payouts.landlord_id` n'est pas nullable : sans bailleur, pas de constaté. Tracé, pour
            // que le débit resté sans pendant s'explique.
            Log::warning('observed_refund_payout_without_landlord', [
                'payable' => $payment::class,
                'payable_id' => $payment->getKey(),
            ]);

            return null;
        }

        $currency = $payment->currency instanceof Currency ? $payment->currency : Currency::XOF;
        $amount = Currency::roundAmount($amount, $currency);

        return Payout::create([
            'lease_id' => $leaseId,
            'booking_id' => $bookingId,
            'agency_id' => $agencyId,
            'landlord_id' => $landlordId,
            'payee_role' => PayeeRole::Tenant->value,
            'issued_by_id' => $issuedById,
            'reference_number' => ReferenceNumberGenerator::payout(),
            'status' => PayoutStatus::Completed->value,
            'period_start' => $at->toDateString(),
            'period_end' => $at->toDateString(),
            'gross_amount' => $amount,
            'commission_amount' => 0,
            'net_amount' => $amount,
            'currency' => $currency->value,
            'processed_at' => $at,
            'refunded_payment_type' => $payment::class,
            'refunded_payment_id' => $payment->getKey(),
        ]);
    }

    /** @return array{0: ?int, 1: ?int, 2: ?int, 3: ?int} agence, bailleur, bail, réservation */
    private function parties(LeasePayment|BookingPayment $payment): array
    {
        if ($payment instanceof LeasePayment) {
            $lease = Lease::withTrashed()->find($payment->lease_id, ['id', 'agency_id', 'landlord_id']);

            return [$this->int($lease?->agency_id), $this->int($lease?->landlord_id), $this->int($lease?->id), null];
        }

        $booking = Booking::withTrashed()->find($payment->booking_id, ['id', 'agency_id', 'property_id']);
        $landlordId = $booking !== null
            ? Property::withTrashed()->whereKey($booking->property_id)->value('user_id')
            : null;

        return [$this->int($booking?->agency_id), $this->int($landlordId), null, $this->int($booking?->id)];
    }

    private function int(mixed $value): ?int
    {
        return $value !== null ? (int) $value : null;
    }
}
