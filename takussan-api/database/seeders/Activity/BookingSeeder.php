<?php

namespace Database\Seeders\Activity;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Carbon\CarbonImmutable;
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
            $agents = $this->ctx->equipe($agency->id);

            if ($properties->isEmpty() || $customers->isEmpty() || $agents->isEmpty()) {
                continue;
            }

            // TCK-2377 — on ne réserve qu'un bien publié, après sa mise en ligne, et le client est
            // inscrit avant de réserver.
            $properties = $properties->filter(fn (Property $p) => $p->status !== PropertyStatus::Draft)->values();

            for ($i = 0; $i < $this->ctx->volume($this->ctx->config->bookingsPerAgency, $agency->id) && $properties->isNotEmpty(); $i++) {
                $property = Tirage::un($properties);
                $createdAt = Timeline::randomDateBetween(
                    CarbonImmutable::parse($property->created_at)->addDays(2),
                    Timeline::seedEnd()->subDays(3),
                );
                $inscrits = $customers->filter(fn (Customer $c) => CarbonImmutable::parse($c->created_at)->lessThan($createdAt));
                if ($inscrits->isEmpty()) {
                    continue;
                }
                $customerId = Tirage::un($inscrits)->id;

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
                    $property, $customerId, $agency,
                    $createdAt, $startDate, $status, $expiresAt, $confirmedAt, $cancelledAt,
                    $totalAmount, $depositAmount,
                ) {
                    Booking::create([
                        'property_id' => $property->id,
                        'customer_id' => $customerId,
                        'created_by_id' => $this->ctx->agentAu($agency->id, $createdAt),
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
