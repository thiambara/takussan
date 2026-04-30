<?php

namespace Tests\Feature\Crm;

use App\Jobs\SendTaskDueReminders;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskDueReminderNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class TaskReminderTest extends TestCase
{
    use RefreshDatabase;

    public function test_sends_reminder_when_task_due_in_24_hours(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $task = Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $user->id,
            'created_by_id' => $user->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Open,
        ]);

        (new SendTaskDueReminders)->handle();

        Notification::assertSentTo($user, TaskDueReminderNotification::class, function ($n) use ($task) {
            return $n->task->id === $task->id;
        });
    }

    public function test_does_not_send_when_task_is_outside_window(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $user->id,
            'created_by_id' => $user->id,
            'due_at' => now()->addDays(5),
            'status' => TaskStatus::Open,
        ]);

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    public function test_does_not_send_when_task_already_done(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $user->id,
            'created_by_id' => $user->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Done,
        ]);

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    public function test_idempotent_marker_prevents_duplicate_reminders(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $task = Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $user->id,
            'created_by_id' => $user->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Open,
        ]);

        (new SendTaskDueReminders)->handle();
        Notification::assertSentToTimes($user, TaskDueReminderNotification::class, 1);

        (new SendTaskDueReminders)->handle();
        // Should still only have been sent once.
        Notification::assertSentToTimes($user, TaskDueReminderNotification::class, 1);

        $this->assertNotNull($task->fresh()->metadata[SendTaskDueReminders::META_MARKER] ?? null);
    }

    public function test_does_not_send_when_no_assignee(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => null,
            'created_by_id' => $user->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Open,
        ]);

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    public function test_artisan_command_runs(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $user->id,
            'created_by_id' => $user->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Open,
        ]);

        $this->artisan('tasks:send-due-reminders')->assertSuccessful();
        Notification::assertSentTo($user, TaskDueReminderNotification::class);
    }
}
