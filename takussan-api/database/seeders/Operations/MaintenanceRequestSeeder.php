<?php

namespace Database\Seeders\Operations;

use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
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
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
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

                for ($i = 0; $i < $requestsForProperty; $i++) {
                    $createdAt = Timeline::randomDateBetween(
                        Timeline::seedStart(),
                        Timeline::seedEnd()->subDays(1),
                    );

                    $status = StatusDistribution::pick([
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
                        ? $createdAt->addDays(mt_rand(1, 15))
                        : null;

                    $category = $this->ctx->faker()->randomElement(MaintenanceCategory::cases());
                    [$title, $description] = $this->ctx->texts()->intervention($category);

                    MaintenanceRequest::create([
                        'property_id' => $property->id,
                        'requester_id' => $property->user_id,
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
