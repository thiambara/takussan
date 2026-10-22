<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1311 (P147.09) — `completed_at` suit le statut `done` : posé à la naissance d'une tâche
 * `done` (la création ne le posait pas) et remis à nul à la réouverture (il restait).
 */
class TaskCompletedAtTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->customer = Customer::factory()->create(['added_by_id' => $this->user->id]);
        Sanctum::actingAs($this->user);
    }

    public function test_une_tache_nee_done_porte_completed_at(): void
    {
        $id = $this->postJson('/api/tasks', [
            'title' => 'Déjà fait',
            'taskable_id' => $this->customer->id,
            'taskable_type' => Customer::class,
            'status' => TaskStatus::Done->value,
        ])->assertCreated()->json('data.id');

        $this->assertNotNull(Task::query()->findOrFail($id)->completed_at);
    }

    public function test_une_tache_nee_ouverte_n_en_porte_pas(): void
    {
        $id = $this->postJson('/api/tasks', [
            'title' => 'À faire',
            'taskable_id' => $this->customer->id,
            'taskable_type' => Customer::class,
        ])->assertCreated()->json('data.id');

        $this->assertNull(Task::query()->findOrFail($id)->completed_at);
    }

    public function test_la_reouverture_remet_completed_at_a_nul(): void
    {
        $task = Task::create([
            'title' => 'Fait',
            'taskable_id' => $this->customer->id,
            'taskable_type' => Customer::class,
            'created_by_id' => $this->user->id,
            'status' => TaskStatus::Done,
            'priority' => TaskPriority::Medium,
            'completed_at' => now()->subDay(),
        ]);

        foreach ([TaskStatus::Open, TaskStatus::InProgress] as $status) {
            $task->forceFill(['status' => TaskStatus::Done, 'completed_at' => now()->subDay()])->save();
            $this->putJson("/api/tasks/{$task->id}", ['status' => $status->value])->assertOk();
            $this->assertNull($task->fresh()->completed_at, $status->value);
        }
    }
}
