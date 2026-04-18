<?php

namespace Database\Seeders\Activity;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\UserType;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class BookingSeeder extends Seeder
{
    /** Bookings created per agency. */
    private const PER_AGENCY = 80;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->usersOfType($agency->id, UserType::Agent->value);

            if ($properties->isEmpty() || $customers->isEmpty() || $agents->isEmpty()) {
                continue;
            }

            $propertyIds = $properties->pluck('id')->values();
            $customerIds = $customers->pluck('id')->values();
            $agentIds = $agents->pluck('id')->values();

            for ($i = 0; $i < self::PER_AGENCY; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd()->subDays(3),
                );

                $status = StatusDistribution::pick([
                    BookingStatus::Completed->value => 40,
                    BookingStatus::Expired->value => 20,
                    BookingStatus::Cancelled->value => 15,
                    BookingStatus::Confirmed->value => 15,
                    BookingStatus::Pending->value => 10,
                ]);

                $expiresAt = $createdAt->addDays(7);
                $confirmedAt = in_array($status, [
                    BookingStatus::Confirmed->value,
                    BookingStatus::Completed->value,
                ], true) ? $createdAt->addDays(random_int(0, 3)) : null;

                $cancelledAt = $status === BookingStatus::Cancelled->value
                    ? $createdAt->addDays(random_int(0, 5))
                    : null;

                $totalAmount = $this->ctx->faker()->numberBetween(150_000, 3_000_000);
                $depositAmount = $this->ctx->faker()->numberBetween(
                    50_000,
                    min(500_000, $totalAmount),
                );

                Booking::withoutEvents(function () use (
                    $propertyIds, $customerIds, $agentIds, $agency,
                    $createdAt, $status, $expiresAt, $confirmedAt, $cancelledAt,
                    $totalAmount, $depositAmount,
                ) {
                    Booking::create([
                        'property_id' => $propertyIds->random(),
                        'customer_id' => $customerIds->random(),
                        'created_by_id' => $agentIds->random(),
                        'agency_id' => $agency->id,
                        'reference_number' => 'BK-'.strtoupper(Str::random(8)),
                        'status' => $status,
                        'total_amount' => $totalAmount,
                        'deposit_amount' => $depositAmount,
                        'currency' => 'XOF',
                        'start_date' => $createdAt->addDays(7)->toDateString(),
                        'end_date' => $createdAt->addMonth()->toDateString(),
                        'expires_at' => $expiresAt,
                        'confirmed_at' => $confirmedAt,
                        'cancelled_at' => $cancelledAt,
                        'cancellation_by' => $cancelledAt
                            ? $this->ctx->faker()->randomElement([
                                CancellationBy::Customer->value,
                                CancellationBy::Agent->value,
                            ])
                            : null,
                        'cancellation_reason' => $cancelledAt
                            ? $this->ctx->faker()->sentence()
                            : null,
                        'created_at' => $createdAt,
                        'updated_at' => $confirmedAt ?? $cancelledAt ?? $createdAt,
                    ]);
                });
            }
        }
    }
}
