<?php

namespace Database\Seeders\Operations;

use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Task;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class TaskSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            if ($agents->isEmpty() || $properties->isEmpty()) {
                continue;
            }

            $agentIds = $agents->pluck('id')->values();

            foreach ($properties as $property) {
                if (! $this->ctx->faker()->boolean(35)) {
                    continue;
                }
                $count = random_int(1, 3);
                for ($i = 0; $i < $count; $i++) {
                    $createdAt = Timeline::randomDateBetween(
                        Timeline::seedStart(),
                        Timeline::seedEnd(),
                    );
                    $status = StatusDistribution::pick([
                        TaskStatus::Done->value => 55,
                        TaskStatus::Open->value => 20,
                        TaskStatus::InProgress->value => 15,
                        TaskStatus::Cancelled->value => 10,
                    ]);

                    Task::create([
                        'title' => $this->ctx->faker()->sentence(6),
                        'description' => $this->ctx->faker()->paragraph(),
                        'taskable_id' => $property->id,
                        'taskable_type' => Property::class,
                        'assigned_to_id' => $agentIds->random(),
                        'created_by_id' => $agentIds->random(),
                        'due_at' => $createdAt->addDays(random_int(1, 14)),
                        'completed_at' => $status === TaskStatus::Done->value
                            ? $createdAt->addDays(random_int(1, 10))
                            : null,
                        'status' => $status,
                        'priority' => $this->ctx->faker()->randomElement(TaskPriority::cases())->value,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                }
            }
        }
    }
}
