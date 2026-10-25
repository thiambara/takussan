<?php

namespace Database\Seeders\Activity;

use App\Models\Customer;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyVisit;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
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

            $agentIds = $agents->pluck('id')->values();

            foreach ($properties as $property) {
                // TCK-2377 — un brouillon ne se visite pas, et aucune visite ne précède la mise en ligne
                // du bien ni l'inscription du client : tirées sur toute la fenêtre, 1 123 l'étaient.
                if ($property->status === PropertyStatus::Draft) {
                    continue;
                }

                $visitCount = mt_rand(2, 6);
                for ($i = 0; $i < $visitCount; $i++) {
                    $scheduledAt = Timeline::businessHour(
                        Timeline::randomDateBetween(
                            CarbonImmutable::parse($property->created_at)->addDays(3),
                            Timeline::seedEnd()->addMonth(),
                        ),
                    );
                    $inscrits = $customers->filter(fn (Customer $c) => CarbonImmutable::parse($c->created_at)->lessThan($scheduledAt->subDays(3)));
                    if ($inscrits->isEmpty()) {
                        continue;
                    }

                    $isFuture = $scheduledAt->isFuture();
                    $status = $isFuture
                        ? VisitStatus::Scheduled->value
                        : StatusDistribution::pick([
                            VisitStatus::Completed->value => 70,
                            VisitStatus::Cancelled->value => 15,
                            VisitStatus::NoShow->value => 15,
                        ]);

                    PropertyVisit::create([
                        'property_id' => $property->id,
                        'visitor_id' => null,
                        'customer_id' => Tirage::un($inscrits)->id,
                        'agent_id' => Tirage::un($agentIds),
                        'type' => VisitType::InPerson->value,
                        'status' => $status,
                        'scheduled_at' => $scheduledAt,
                        'duration_minutes' => 45,
                        'completed_at' => $status === VisitStatus::Completed->value
                            ? $scheduledAt->addMinutes(mt_rand(30, 75))
                            : null,
                        'cancelled_at' => in_array($status, [
                            VisitStatus::Cancelled->value,
                            VisitStatus::NoShow->value,
                        ], true) ? $scheduledAt->subDays(mt_rand(0, 2)) : null,
                        // created_at is always strictly before cancelled_at (>=3 days earlier)
                        // so the visit record exists before it can be cancelled.
                        'created_at' => collect([$scheduledAt->subDays(mt_rand(3, 10)), CarbonImmutable::parse($property->created_at)->addDay()])->max(),
                        'updated_at' => $scheduledAt,
                    ]);
                }
            }
        }
    }
}
