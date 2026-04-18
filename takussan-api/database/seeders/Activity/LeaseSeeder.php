<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\Property;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class LeaseSeeder extends Seeder
{
    /** Leases per agency. */
    private const PER_AGENCY = 70;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyLeases($agency->id);
        }

        $this->ctx->activeLeases = $this->ctx->leases
            ->filter(fn (Lease $l) => $l->status === LeaseStatus::Active)
            ->values();
    }

    private function seedAgencyLeases(int $agencyId): void
    {
        $properties = $this->ctx->propertiesByAgency[$agencyId] ?? collect();
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();
        if ($properties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        $customerIds = $customers->pluck('id')->values();

        $statusCounts = StatusDistribution::split(self::PER_AGENCY, [
            LeaseStatus::Active->value => 70,
            LeaseStatus::Terminated->value => 15,
            LeaseStatus::Expired->value => 8,
            LeaseStatus::Renewed->value => 4,
            LeaseStatus::Draft->value => 3,
        ]);

        foreach ($statusCounts as $status => $count) {
            for ($i = 0; $i < $count; $i++) {
                $property = $properties->random();
                $startDate = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedStart()->addMonths(10),
                );
                $endDate = $startDate->addYear();

                $monthlyRent = $this->ctx->faker()->numberBetween(200_000, 1_800_000);
                $terminatedAt = $status === LeaseStatus::Terminated->value
                    ? Timeline::randomDateBetween($startDate->addMonths(2), Timeline::seedEnd())
                    : null;

                $lease = Lease::withoutEvents(function () use (
                    $property, $customerIds, $agencyId, $status,
                    $startDate, $endDate, $monthlyRent, $terminatedAt
                ) {
                    return Lease::create([
                        'property_id' => $property->id,
                        'landlord_id' => $property->user_id,
                        'tenant_id' => $customerIds->random(),
                        'agency_id' => $agencyId,
                        'reference_number' => 'LS-'.strtoupper(Str::random(8)),
                        'type' => LeaseType::ResidentialRent->value,
                        'status' => $status,
                        'start_date' => $startDate->toDateString(),
                        'end_date' => $endDate->toDateString(),
                        'monthly_rent' => $monthlyRent,
                        'currency' => 'XOF',
                        'deposit_amount' => $monthlyRent,
                        'commission_rate' => $this->ctx->faker()->randomFloat(2, 5, 10),
                        'payment_frequency' => PaymentFrequency::Monthly->value,
                        'payment_day' => 5,
                        'signed_at' => $status === LeaseStatus::Draft->value ? null : $startDate->subDays(2),
                        'terminated_at' => $terminatedAt,
                        'termination_reason' => $terminatedAt ? 'Départ du locataire' : null,
                        'created_at' => $startDate->subDays(5),
                        'updated_at' => $terminatedAt ?? $startDate,
                    ]);
                });

                $this->ctx->leases->push($lease);
            }
        }

        // Mark leased properties as Rented.
        $rentedPropertyIds = $this->ctx->leases
            ->where('status', LeaseStatus::Active)
            ->pluck('property_id')
            ->unique()
            ->values();
        if ($rentedPropertyIds->isNotEmpty()) {
            Property::whereIn('id', $rentedPropertyIds)
                ->update(['status' => PropertyStatus::Rented->value]);
        }
    }
}
