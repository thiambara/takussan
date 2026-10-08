<?php

namespace Tests\Concerns;

use App\Models\Agency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-594 — les pièces d'un reversement : une agence, un bailleur, un bail, des loyers encaissés.
 *
 * Le jeu de référence est celui d'AC1 : un bail à 10 %, en septembre 2026, un loyer de 200 000 payé,
 * des charges de 20 000 payées, une caution de 400 000 payée et un loyer de 200 000 `pending`.
 */
trait BuildsMoneyOut
{
    protected function moneyAgency(array $attributes = []): Agency
    {
        return Agency::factory()->create(array_merge([
            'commission_rate' => 8,
            'is_verified' => true,
        ], $attributes));
    }

    protected function landlordOf(Agency $agency): User
    {
        return User::factory()->withOwnerProfile($agency)->create();
    }

    protected function leaseOf(Agency $agency, User $landlord, ?float $commissionRate = 10): Lease
    {
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'status' => LeaseStatus::Active,
            'commission_rate' => $commissionRate,
        ]);
    }

    protected function leasePayment(
        Lease $lease,
        float $amount,
        LeasePaymentType $type = LeasePaymentType::Rent,
        ?string $paidAt = '2026-09-10 10:00:00',
        PaymentStatus $status = PaymentStatus::Paid,
    ): LeasePayment {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $amount,
            'payment_type' => $type,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? $paidAt : null,
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
            'due_date' => '2026-09-05',
        ]);
    }

    /**
     * Le jeu d'AC1 sur un bail : rend [loyer payé, charges payées, caution payée, loyer en attente].
     *
     * @return array{0: LeasePayment, 1: LeasePayment, 2: LeasePayment, 3: LeasePayment}
     */
    protected function septemberOf(Lease $lease): array
    {
        return [
            $this->leasePayment($lease, 200_000),
            $this->leasePayment($lease, 20_000, LeasePaymentType::Charges, '2026-09-12 10:00:00'),
            $this->leasePayment($lease, 400_000, LeasePaymentType::Deposit, '2026-09-02 10:00:00'),
            $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, null, PaymentStatus::Pending),
        ];
    }
}
