<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-2637 — les biens, baux et échéances des tests d'occupation : un bien loué au mois, un bail
 * qui court du 1er janvier au 31 décembre 2026, et l'échéance de loyer d'un mois donné. Le temps
 * est figé par le test (`travelTo('2026-11-11 10:00:00')`) : « le 5 novembre » est échu de 6 jours.
 *
 * Un trait et non une classe de base : `scripts/check-test-base-classes.mjs` n'en admet que trois.
 */
trait FabriqueOccupation
{
    /** @param  array<string, mixed>  $attributes */
    protected function bienLoue(Agency $agency, User $owner, string $title, array $attributes = []): Property
    {
        return Property::factory()->create($attributes + [
            'agency_id' => $agency->id,
            'user_id' => $owner->id,
            'title' => $title,
            'contract_type' => ContractType::Rent->value,
            'rent_period' => RentPeriod::Monthly->value,
            'status' => 'available',
            // Hors ligne par défaut : un test qui compte les biens en ligne les nomme.
            'visibility' => 'private',
            'published_at' => null,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function bail(Property $property, string $tenant, array $attributes = [], ?string $phone = null): Lease
    {
        [$first, $last] = explode(' ', $tenant, 2);

        return Lease::factory()->create($attributes + [
            'property_id' => $property->id,
            'agency_id' => $property->agency_id,
            'landlord_id' => $property->user_id,
            'tenant_id' => Customer::factory()->create([
                'agency_id' => $property->agency_id,
                'first_name' => $first,
                'last_name' => $last,
                'phone' => $phone ?? '+22177'.random_int(1000000, 9999999),
            ])->id,
            'status' => LeaseStatus::Active,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'monthly_rent' => 300_000,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    protected function loyer(Lease $lease, string $due, PaymentStatus $status, array $attributes = []): LeasePayment
    {
        $start = substr($due, 0, 7).'-01';

        return LeasePayment::factory()->create($attributes + [
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent,
            'amount' => 300_000,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? $due.' 10:00:00' : null,
            'due_date' => $due,
            'period_start' => $start,
            'period_end' => date('Y-m-t', strtotime($start)),
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
            'late_fee_paid_at' => null,
        ]);
    }
}
