<?php

namespace Database\Seeders\Operations;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use Carbon\CarbonImmutable;
use Database\Seeders\Activity\LeaseSeeder;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

class MaintenanceRequestSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            // TCK-2377 — une intervention porte sur un bien bâti et publié : tirée dans tout le parc,
            // elle tombait sur des terrains et des garages (40 sur 150).
            $properties = ($this->ctx->propertiesByAgency[$agency->id] ?? collect())
                ->filter(fn (Property $p) => $p->status !== PropertyStatus::Draft && LeaseSeeder::typeDeBailPour($p) !== null)
                ->values();
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            $providers = $this->ctx->usersWithProfile(ServiceProviderProfile::class, $agency->id);

            if ($properties->isEmpty()) {
                continue;
            }

            $providerIds = $providers->isEmpty() ? [null] : $providers->pluck('id')->all();
            $targetCount = $this->ctx->config->maintenanceRequestsPerAgency;
            $created = 0;

            while ($created < $targetCount && $properties->isNotEmpty()) {
                $property = Tirage::un($properties);
                $requestsForProperty = min(mt_rand(1, 3), $targetCount - $created);

                $baux = $this->ctx->leases
                    ->filter(fn (Lease $l) => $l->property_id === $property->id
                        && $l->status !== LeaseStatus::Draft
                        && CarbonImmutable::parse($l->start_date)->lessThan(Timeline::seedEnd()->subDays(10)))
                    ->values();

                for ($i = 0; $i < $requestsForProperty; $i++) {
                    // Pendant un bail, le locataire la signale — par son compte s'il en a un ; hors bail,
                    // c'est le bailleur.
                    $bail = $baux->isNotEmpty() && mt_rand(1, 100) <= 75 ? Tirage::un($baux) : null;
                    $createdAt = $bail !== null
                        ? Timeline::randomDateBetween(
                            CarbonImmutable::parse($bail->start_date)->addDays(7),
                            collect([CarbonImmutable::parse($bail->terminated_at ?? $bail->end_date), Timeline::seedEnd()->subDays(1)])->min(),
                        )
                        : Timeline::randomDateBetween(
                            CarbonImmutable::parse($property->created_at)->addDays(3),
                            Timeline::seedEnd()->subDays(1),
                        );
                    $requesterId = $customers->get($bail?->tenant_id)?->user_id ?? $property->user_id;

                    // Une demande ancienne est close ; seules les récentes sont encore en cours.
                    $status = $createdAt->lessThan(Timeline::seedEnd()->subDays(60)) ? StatusDistribution::pick([
                        MaintenanceStatus::Completed->value => 88,
                        MaintenanceStatus::Cancelled->value => 12,
                    ]) : StatusDistribution::pick([
                        MaintenanceStatus::Completed->value => 45,
                        MaintenanceStatus::InProgress->value => 15,
                        MaintenanceStatus::Assigned->value => 15,
                        MaintenanceStatus::Acknowledged->value => 10,
                        MaintenanceStatus::Open->value => 10,
                        MaintenanceStatus::Cancelled->value => 5,
                    ]);

                    $assignedTo = in_array($status, [
                        MaintenanceStatus::Assigned->value,
                        MaintenanceStatus::InProgress->value,
                        MaintenanceStatus::Completed->value,
                    ], true) ? $providerIds[array_rand($providerIds)] : null;

                    $completedAt = $status === MaintenanceStatus::Completed->value
                        ? collect([$createdAt->addDays(mt_rand(1, 15)), Timeline::seedEnd()->subHour()])->min()
                        : null;

                    $category = $this->ctx->faker()->randomElement(MaintenanceCategory::cases());
                    [$title, $description] = $this->ctx->texts()->intervention($category);

                    MaintenanceRequest::create([
                        'property_id' => $property->id,
                        'requester_id' => $requesterId,
                        'lease_id' => $bail?->id,
                        'assigned_to' => $assignedTo,
                        'title' => $title,
                        'description' => $description,
                        'category' => $category->value,
                        'priority' => $this->ctx->faker()->randomElement(MaintenancePriority::cases())->value,
                        'status' => $status,
                        'estimated_cost' => $this->ctx->faker()->numberBetween(15_000, 300_000),
                        'actual_cost' => $completedAt
                            ? $this->ctx->faker()->numberBetween(10_000, 350_000)
                            : null,
                        'scheduled_at' => $assignedTo ? $createdAt->addDays(mt_rand(1, 5)) : null,
                        'started_at' => in_array($status, [
                            MaintenanceStatus::InProgress->value,
                            MaintenanceStatus::Completed->value,
                        ], true) ? $createdAt->addDays(mt_rand(1, 6)) : null,
                        'completed_at' => $completedAt,
                        'resolution_notes' => $completedAt ? $this->ctx->texts()->compteRenduDIntervention() : null,
                        'created_at' => $createdAt,
                        'updated_at' => $completedAt ?? $createdAt,
                    ]);
                    $created++;
                }
            }
        }
    }
}
