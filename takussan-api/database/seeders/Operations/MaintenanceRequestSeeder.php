<?php

namespace Database\Seeders\Operations;

use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\UserType;
use App\Models\MaintenanceRequest;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class MaintenanceRequestSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $providers = $this->ctx->usersOfType($agency->id, UserType::ServiceProvider->value);

            if ($properties->isEmpty()) {
                continue;
            }

            $providerIds = $providers->isEmpty() ? [null] : $providers->pluck('id')->all();
            $targetCount = $this->ctx->config->maintenanceRequestsPerAgency;
            $created = 0;

            while ($created < $targetCount && $properties->isNotEmpty()) {
                $property = $properties->random();
                $requestsForProperty = min(random_int(1, 3), $targetCount - $created);

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
                        ? $createdAt->addDays(random_int(1, 15))
                        : null;

                    MaintenanceRequest::create([
                        'property_id' => $property->id,
                        'requester_id' => $property->user_id,
                        'assigned_to' => $assignedTo,
                        'title' => $this->ctx->faker()->sentence(4),
                        'description' => $this->ctx->faker()->paragraph(),
                        'category' => $this->ctx->faker()->randomElement(MaintenanceCategory::cases())->value,
                        'priority' => $this->ctx->faker()->randomElement(MaintenancePriority::cases())->value,
                        'status' => $status,
                        'estimated_cost' => $this->ctx->faker()->numberBetween(15_000, 300_000),
                        'actual_cost' => $completedAt
                            ? $this->ctx->faker()->numberBetween(10_000, 350_000)
                            : null,
                        'scheduled_at' => $assignedTo ? $createdAt->addDays(random_int(1, 5)) : null,
                        'started_at' => in_array($status, [
                            MaintenanceStatus::InProgress->value,
                            MaintenanceStatus::Completed->value,
                        ], true) ? $createdAt->addDays(random_int(1, 6)) : null,
                        'completed_at' => $completedAt,
                        'resolution_notes' => $completedAt ? $this->ctx->faker()->sentence() : null,
                        'created_at' => $createdAt,
                        'updated_at' => $completedAt ?? $createdAt,
                    ]);
                    $created++;
                }
            }
        }
    }
}
