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

class TaskTest extends TestCase
{
    use RefreshDatabase;

    private function makeTask(User $user): Task
    {
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        return Task::create([
            'title' => 'Follow up with customer',
            'taskable_id' => $customer->id,
            'taskable_type' => Customer::class,
            'created_by_id' => $user->id,
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::Medium,
        ]);
    }

    public function test_user_can_create_task(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson('/api/tasks', [
            'title' => 'Call client',
            'taskable_id' => $customer->id,
            'taskable_type' => Customer::class,
            'due_at' => now()->addDays(3)->toDateTimeString(),
            'priority' => TaskPriority::High->value,
        ])->assertStatus(201)
            ->assertJsonPath('data.title', 'Call client')
            ->assertJsonPath('data.status', TaskStatus::Open->value);
    }

    public function test_user_can_list_own_tasks(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->makeTask($user);
        $this->makeTask($other);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/tasks')->assertOk();
        $this->assertEquals(1, $response->json('meta.total'));
    }

    public function test_user_can_show_own_task(): void
    {
        $user = User::factory()->create();
        $task = $this->makeTask($user);

        Sanctum::actingAs($user);

        $this->getJson("/api/tasks/{$task->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $task->id);
    }

    public function test_user_cannot_show_another_users_task(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $task = $this->makeTask($owner);

        Sanctum::actingAs($other);

        $this->getJson("/api/tasks/{$task->id}")->assertForbidden();
    }

    public function test_user_can_update_task_status(): void
    {
        $user = User::factory()->create();
        $task = $this->makeTask($user);

        Sanctum::actingAs($user);

        $this->putJson("/api/tasks/{$task->id}", [
            'status' => TaskStatus::Done->value,
        ])->assertOk()
            ->assertJsonPath('data.status', TaskStatus::Done->value);

        $this->assertNotNull($task->fresh()->completed_at);
    }

    public function test_user_can_delete_own_task(): void
    {
        $user = User::factory()->create();
        $task = $this->makeTask($user);

        Sanctum::actingAs($user);

        $this->deleteJson("/api/tasks/{$task->id}")->assertNoContent();
        $this->assertSoftDeleted('tasks', ['id' => $task->id]);
    }

    public function test_invalid_status_returns_422(): void
    {
        $user = User::factory()->create();
        $task = $this->makeTask($user);

        Sanctum::actingAs($user);

        $this->putJson("/api/tasks/{$task->id}", ['status' => 'invalid_status'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);
    }

    public function test_create_requires_auth(): void
    {
        $this->postJson('/api/tasks', ['title' => 'Test'])->assertUnauthorized();
    }

    public function test_user_cannot_attach_task_to_another_users_record(): void
    {
        $user = User::factory()->create();
        $stranger = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $stranger->id]);

        Sanctum::actingAs($user);

        $this->postJson('/api/tasks', [
            'title' => 'Sneaky cross-tenant task',
            'taskable_id' => $customer->id,
            'taskable_type' => Customer::class,
        ])->assertForbidden();
    }

    public function test_create_rejects_taskable_type_outside_allowlist(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/tasks', [
            'title' => 'Bad morph type',
            'taskable_id' => $user->id,
            'taskable_type' => User::class,
        ])->assertStatus(422)->assertJsonValidationErrors(['taskable_type']);
    }
}
