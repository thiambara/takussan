<?php

namespace Database\Seeders\Activity;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Profiles\AgentProfile;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

class BookingSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);

            if ($properties->isEmpty() || $customers->isEmpty() || $agents->isEmpty()) {
                continue;
            }

            $propertyIds = $properties->pluck('id')->values();
            $customerIds = $customers->pluck('id')->values();
            $agentIds = $agents->pluck('id')->values();

            for ($i = 0; $i < $this->ctx->config->bookingsPerAgency; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd()->subDays(3),
                );

                // TCK-2376 — une réservation n'est terminée qu'une fois commencée, et n'expire qu'une
                // fois son délai passé : tirées sans regard pour la date, les réservations des
                // derniers jours sortaient `completed` avant leur début.
                $startDate = $createdAt->addDays(7);
                $status = StatusDistribution::pick($startDate->isFuture()
                    ? [
                        BookingStatus::Confirmed->value => 45,
                        BookingStatus::Pending->value => 40,
                        BookingStatus::Cancelled->value => 15,
                    ]
                    : [
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
                ], true) ? $createdAt->addDays(mt_rand(0, 3)) : null;

                $cancelledAt = $status === BookingStatus::Cancelled->value
                    ? $createdAt->addDays(mt_rand(0, 5))
                    : null;

                $totalAmount = $this->ctx->faker()->numberBetween(150_000, 3_000_000);
                $depositAmount = $this->ctx->faker()->numberBetween(
                    50_000,
                    min(500_000, $totalAmount),
                );

                Booking::withoutEvents(function () use (
                    $propertyIds, $customerIds, $agentIds, $agency,
                    $createdAt, $startDate, $status, $expiresAt, $confirmedAt, $cancelledAt,
                    $totalAmount, $depositAmount,
                ) {
                    Booking::create([
                        'property_id' => Tirage::un($propertyIds),
                        'customer_id' => Tirage::un($customerIds),
                        'created_by_id' => Tirage::un($agentIds),
                        'agency_id' => $agency->id,
                        'reference_number' => 'BK-'.strtoupper(Tirage::code(8)),
                        'status' => $status,
                        'total_amount' => $totalAmount,
                        'deposit_amount' => $depositAmount,
                        'currency' => 'XOF',
                        'start_date' => $startDate->toDateString(),
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
                            ? $this->ctx->texts()->motifDAnnulation()
                            : null,
                        'created_at' => $createdAt,
                        'updated_at' => $confirmedAt ?? $cancelledAt ?? $createdAt,
                    ]);
                });
            }
        }
    }
}
