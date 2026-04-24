<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

class TaskFactory extends Factory
{
    protected $model = Task::class;

    public function definition(): array
    {
        return [
            'title' => fake()->sentence(4),
            'description' => fake()->paragraph(),
            'taskable_id' => null,
            'taskable_type' => null,
            'assigned_to_id' => null,
            'created_by_id' => null,
            'due_at' => now()->addDays(2),
            'completed_at' => null,
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::Medium,
            'metadata' => null,
        ];
    }

    public function forCustomer(Customer $customer): static
    {
        return $this->state([
            'taskable_id' => $customer->id,
            'taskable_type' => Customer::class,
        ]);
    }
}
