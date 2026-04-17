<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\UserType;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds a realistic demo dataset: agencies, owners, agents, tenants,
 * properties, bookings, leases, payments, visits, invoices, payouts.
 *
 * Safe to run against a fresh DB — does NOT wipe existing data.
 * Use: php artisan db:seed --class=DemoSeeder
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $agencies = Agency::factory()->count(2)->create();

        $owners = collect();
        foreach ($agencies as $agency) {
            $owners->push(
                User::factory()->count(3)->create([
                    'type' => UserType::Owner,
                    'agency_id' => $agency->id,
                ])
            );
        }
        $owners = $owners->flatten();

        $tenantUsers = User::factory()->count(8)->create();

        $customers = $tenantUsers->map(fn ($u) => Customer::factory()->create([
            'user_id' => $u->id,
            'added_by_id' => $owners->random()->id,
            'status' => CustomerStatus::Active,
        ]));

        $properties = collect();
        foreach ($owners as $owner) {
            $properties = $properties->merge(
                Property::factory()->count(3)->published()->create([
                    'user_id' => $owner->id,
                    'agency_id' => $owner->agency_id,
                    'status' => PropertyStatus::Available,
                ])
            );
        }

        Property::factory()->count(3)->create([
            'user_id' => $owners->random()->id,
            'status' => PropertyStatus::Draft,
            'published_at' => null,
        ]);

        foreach ($properties->random(min(5, $properties->count())) as $property) {
            $customer = $customers->random();

            $booking = Booking::factory()->create([
                'property_id' => $property->id,
                'customer_id' => $customer->id,
                'created_by_id' => $property->user_id,
                'agency_id' => $property->agency_id,
                'status' => BookingStatus::Confirmed,
            ]);

            BookingPayment::factory()->count(2)->create([
                'booking_id' => $booking->id,
            ]);
        }

        foreach ($properties->random(min(4, $properties->count())) as $property) {
            $customer = $customers->random();

            $lease = Lease::factory()->create([
                'property_id' => $property->id,
                'landlord_id' => $property->user_id,
                'agency_id' => $property->agency_id,
                'tenant_id' => $customer->id,
                'status' => LeaseStatus::Active,
            ]);

            LeasePayment::factory()->count(3)->create(['lease_id' => $lease->id]);

            Payout::factory()->create([
                'landlord_id' => $lease->landlord_id,
                'agency_id' => $lease->agency_id,
                'lease_id' => $lease->id,
                'issued_by_id' => $lease->landlord_id,
            ]);

            Invoice::factory()->count(2)->create([
                'issued_by_id' => $lease->landlord_id,
                'customer_id' => $lease->tenant_id,
                'agency_id' => $lease->agency_id,
                'invoiceable_id' => $lease->id,
                'invoiceable_type' => Lease::class,
            ]);
        }

        foreach ($properties->random(min(5, $properties->count())) as $property) {
            PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'visitor_id' => $tenantUsers->random()->id,
                'customer_id' => $customers->random()->id,
            ]);
        }
    }
}
