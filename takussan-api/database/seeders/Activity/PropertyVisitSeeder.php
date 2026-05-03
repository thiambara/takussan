<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyVisit;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class PropertyVisitSeeder extends Seeder
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

            $customerIds = $customers->pluck('id')->values();
            $agentIds = $agents->pluck('id')->values();

            foreach ($properties as $property) {
                $visitCount = random_int(2, 6);
                for ($i = 0; $i < $visitCount; $i++) {
                    $scheduledAt = Timeline::businessHour(
                        Timeline::randomDateBetween(
                            Timeline::seedStart(),
                            Timeline::seedEnd()->addMonth(),
                        ),
                    );

                    $isFuture = $scheduledAt->isFuture();
                    $status = $isFuture
                        ? VisitStatus::Scheduled->value
                        : StatusDistribution::pick([
                            VisitStatus::Completed->value => 60,
                            VisitStatus::Cancelled->value => 15,
                            VisitStatus::NoShow->value => 15,
                            VisitStatus::Confirmed->value => 10,
                        ]);

                    PropertyVisit::create([
                        'property_id' => $property->id,
                        'visitor_id' => null,
                        'customer_id' => $customerIds->random(),
                        'agent_id' => $agentIds->random(),
                        'type' => VisitType::InPerson->value,
                        'status' => $status,
                        'scheduled_at' => $scheduledAt,
                        'duration_minutes' => 45,
                        'completed_at' => $status === VisitStatus::Completed->value
                            ? $scheduledAt->addMinutes(random_int(30, 75))
                            : null,
                        'cancelled_at' => in_array($status, [
                            VisitStatus::Cancelled->value,
                            VisitStatus::NoShow->value,
                        ], true) ? $scheduledAt->subDays(random_int(0, 2)) : null,
                        // created_at is always strictly before cancelled_at (>=3 days earlier)
                        // so the visit record exists before it can be cancelled.
                        'created_at' => $scheduledAt->subDays(random_int(3, 10)),
                        'updated_at' => $scheduledAt,
                    ]);
                }
            }
        }
    }
}
