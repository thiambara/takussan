<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * TCK-595 — le jeu de référence **R** des critères d'acceptation, au 2026-07-15.
 *
 * Le bailleur B possède, dans une agence `standard` sans autre bien :
 * - un immeuble parent P (location) et ses deux lots feuilles L1, L2 (mensuels) ;
 * - un lot L3 (mensuel), un bien H (courte durée, `daily`), un bien S en vente, un brouillon D.
 *
 * Tous créés le 2025-12-01. Baux : L1 `expired` du 2026-01-01 au 2026-06-30 ; L2 `active` dès le
 * 2026-03-15, sans fin ; L3 `terminated` du 2026-01-01 au 2026-12-31, résilié le 2026-04-10 ; L3
 * `draft` dès le 2026-05-01. Réservations sur H : `confirmed` du 1ᵉʳ au 6 juillet, `cancelled` du 10
 * au 20. Paiements de juillet : loyer 150 000 payé, dépôt 300 000 payé, restitution 100 000 payée,
 * restitution 40 000 `pending` échue le 1ᵉʳ, loyer 50 000 `pending` échu le 5, réservation 80 000
 * payée dont 20 000 remboursés, et un reversement au bailleur de 135 000 net, traité le 10.
 *
 * Partagé par les tests du bailleur, de l'agence et du budget de requêtes : AC5 compare les DEUX
 * tableaux de bord sur le MÊME jeu.
 */
trait ReferencePortfolio
{
    /**
     * @return array{agency: Agency, owner: User, properties: array<string, Property>, leases: array<string, Lease>}
     */
    protected function buildReferencePortfolio(?User $owner = null, ?Agency $agency = null): array
    {
        Carbon::setTestNow('2026-07-15 00:00:00');

        $agency ??= Agency::factory()->create();
        $owner ??= User::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $owner->id, 'agency_id' => $agency->id]);

        $created = Carbon::parse('2025-12-01 09:00:00');
        $make = fn (array $attrs): Property => Property::factory()->create(array_merge([
            'user_id' => $owner->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'status' => PropertyStatus::Available,
            'created_at' => $created,
        ], $attrs));

        $p = $make([]);
        $props = [
            'P' => $p,
            'L1' => $make(['parent_id' => $p->id]),
            'L2' => $make(['parent_id' => $p->id, 'status' => PropertyStatus::Rented]),
            'L3' => $make([]),
            'H' => $make(['rent_period' => RentPeriod::Daily]),
            'S' => $make(['contract_type' => ContractType::Sale, 'rent_period' => null]),
            'D' => $make(['status' => PropertyStatus::Draft]),
        ];

        $lease = fn (Property $property, array $attrs): Lease => Lease::factory()->create(array_merge([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'agency_id' => $agency->id,
            'monthly_rent' => 150_000,
        ], $attrs));

        $leases = [
            'L1' => $lease($props['L1'], ['status' => LeaseStatus::Expired, 'start_date' => '2026-01-01', 'end_date' => '2026-06-30']),
            'L2' => $lease($props['L2'], ['status' => LeaseStatus::Active, 'start_date' => '2026-03-15', 'end_date' => null]),
            'L3' => $lease($props['L3'], [
                'status' => LeaseStatus::Terminated, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31',
                'terminated_at' => '2026-04-10 16:00:00',
            ]),
            'L3draft' => $lease($props['L3'], ['status' => LeaseStatus::Draft, 'start_date' => '2026-05-01', 'end_date' => null]),
        ];

        $booking = fn (string $status, string $start, string $end): Booking => Booking::factory()->create([
            'property_id' => $props['H']->id,
            'agency_id' => $agency->id,
            'status' => $status,
            'start_date' => $start,
            'end_date' => $end,
        ]);
        $confirmed = $booking(BookingStatus::Confirmed->value, '2026-07-01', '2026-07-06');
        $booking(BookingStatus::Cancelled->value, '2026-07-10', '2026-07-20');

        $pay = fn (Lease $l, LeasePaymentType $type, float $amount, PaymentStatus $status, string $due, ?string $paidAt): LeasePayment => LeasePayment::factory()->create([
            'lease_id' => $l->id,
            'payer_id' => $l->tenant_id,
            'payment_type' => $type,
            'amount' => $amount,
            'status' => $status,
            'due_date' => $due,
            'paid_at' => $paidAt,
        ]);
        $pay($leases['L2'], LeasePaymentType::Rent, 150_000, PaymentStatus::Paid, '2026-07-05', '2026-07-03 10:00:00');
        $pay($leases['L2'], LeasePaymentType::Deposit, 300_000, PaymentStatus::Paid, '2026-07-01', '2026-07-01 10:00:00');
        $pay($leases['L1'], LeasePaymentType::DepositRefund, 100_000, PaymentStatus::Paid, '2026-07-02', '2026-07-02 10:00:00');
        $pay($leases['L3'], LeasePaymentType::DepositRefund, 40_000, PaymentStatus::Pending, '2026-07-01', null);
        $pay($leases['L2'], LeasePaymentType::Rent, 50_000, PaymentStatus::Pending, '2026-07-05', null);

        BookingPayment::factory()->create([
            'booking_id' => $confirmed->id,
            'amount' => 80_000,
            'refund_amount' => 20_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-07-01 12:00:00',
        ]);

        Payout::factory()->create([
            'landlord_id' => $owner->id,
            'agency_id' => $agency->id,
            'payee_role' => PayeeRole::Landlord->value,
            'status' => PayoutStatus::Completed,
            'gross_amount' => 150_000,
            'commission_amount' => 15_000,
            'net_amount' => 135_000,
            'processed_at' => '2026-07-10 11:00:00',
        ]);

        return ['agency' => $agency, 'owner' => $owner, 'properties' => $props, 'leases' => $leases];
    }
}
