<?php

namespace Tests\Concerns;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-596 — une réservation et ses parties nommées : le bailleur, l'agent collaborateur accepté du
 * bien, le client. Les tests de demande, d'annulation et de remboursement vérifient leurs
 * destinataires PAR IDENTIFIANT : chacun doit exister sous son nom.
 */
trait BuildsBookingStakeholders
{
    use CreatesAgencyMembers;

    protected Agency $agency;

    protected User $landlord;

    protected User $agent;

    protected User $client;

    protected Property $property;

    protected function buildStakeholders(ContractType $contract = ContractType::Rent): void
    {
        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
        $this->agent = $this->agencyAgent($this->agency);
        $this->client = User::factory()->create();

        $this->property = Property::factory()->published()->create([
            'user_id' => $this->landlord->id,
            'agency_id' => $this->agency->id,
            'price' => 20_000,
            'currency' => Currency::XOF,
            'contract_type' => $contract,
            'rent_period' => $contract === ContractType::Rent ? RentPeriod::Daily : null,
        ]);

        $this->collaborate($this->agent, CollaboratorRole::Agent);
    }

    protected function collaborate(User $user, CollaboratorRole $role, bool $accepted = true): void
    {
        $this->property->collaborators()->create([
            'user_id' => $user->id,
            'role' => $role->value,
            'accepted_at' => $accepted ? now() : null,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function bookingOfClient(array $attributes = []): Booking
    {
        $customer = Customer::factory()->create(['user_id' => $this->client->id]);

        return Booking::factory()->create(array_merge([
            'property_id' => $this->property->id,
            'customer_id' => $customer->id,
            'created_by_id' => $this->client->id,
            'agency_id' => $this->agency->id,
        ], $attributes));
    }

    protected function paidDeposit(Booking $booking, int $amount = 10_000, PaymentStatus $status = PaymentStatus::Paid): BookingPayment
    {
        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'payment_type' => BookingPaymentType::Deposit,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? now() : null,
        ]);
    }
}
