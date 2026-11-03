<?php

namespace Database\Seeders\Operations;

use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
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
            $agents = $this->ctx->equipe($agency->id);
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            if ($agents->isEmpty() || $properties->isEmpty()) {
                continue;
            }

            foreach ($properties as $property) {
                if (! $this->ctx->faker()->boolean(35)) {
                    continue;
                }
                $count = mt_rand(1, 3);
                for ($i = 0; $i < $count; $i++) {
                    // TCK-2378 — une tâche suit la mise en ligne du bien, et revient à un agent présent ce jour-là.
                    $createdAt = Timeline::randomDateBetween(
                        collect([Timeline::seedStart(), $property->created_at->toImmutable()])->max(),
                        Timeline::seedEnd(),
                    );
                    $status = StatusDistribution::pick([
                        TaskStatus::Done->value => 55,
                        TaskStatus::Open->value => 20,
                        TaskStatus::InProgress->value => 15,
                        TaskStatus::Cancelled->value => 10,
                    ]);

                    [$title, $description] = $this->ctx->texts()->tache();

                    Task::create([
                        'title' => $title,
                        'description' => $description,
                        'taskable_id' => $property->id,
                        'taskable_type' => Property::class,
                        'assigned_to_id' => $this->ctx->agentAu($agency->id, $createdAt),
                        'created_by_id' => $this->ctx->agentAu($agency->id, $createdAt),
                        'due_at' => $createdAt->addDays(mt_rand(1, 14)),
                        'completed_at' => $status === TaskStatus::Done->value
                            ? $createdAt->addDays(mt_rand(1, 10))
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
