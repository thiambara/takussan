<?php

namespace Tests\Feature\Crm;

use App\Jobs\SendTaskDueReminders;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Profiles\AgentProfile;
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

    /**
     * P126.01 — le rappel ne part qu'à un assigné personnel actif de l'agence du dossier
     * (`isStaffAt`) : un agent suspendu ne peut plus ouvrir la tâche, et ne reçoit rien.
     */
    public function test_does_not_remind_an_assignee_suspended_from_the_agency_of_the_record(): void
    {
        Notification::fake();

        [$agency, $customer] = $this->agencyCustomer();
        $agent = $this->agentOf($agency, AgentProfileStatus::Suspended);
        $this->dueTaskFor($customer, $agent);

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    public function test_reminds_an_active_staff_assignee_of_the_agency_of_the_record(): void
    {
        Notification::fake();

        [$agency, $customer] = $this->agencyCustomer();
        $agent = $this->agentOf($agency, AgentProfileStatus::Active);
        $task = $this->dueTaskFor($customer, $agent);

        (new SendTaskDueReminders)->handle();

        Notification::assertSentToTimes($agent, TaskDueReminderNotification::class, 1);
        $this->assertNotNull($task->fresh()->metadata[SendTaskDueReminders::META_MARKER] ?? null);
    }

    public function test_does_not_remind_an_active_agent_of_another_agency(): void
    {
        Notification::fake();

        [, $customer] = $this->agencyCustomer();
        $other = Agency::factory()->create();
        $agent = $this->agentOf($other, AgentProfileStatus::Active);
        $this->dueTaskFor($customer, $agent);

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    /** @return array{0: Agency, 1: Customer} */
    private function agencyCustomer(): array
    {
        $agency = Agency::factory()->create();

        return [$agency, Customer::factory()->create(['agency_id' => $agency->id])];
    }

    private function agentOf(Agency $agency, AgentProfileStatus $status): User
    {
        $user = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => $status,
        ]);

        return $user;
    }

    private function dueTaskFor(Customer $customer, User $assignee): Task
    {
        return Task::factory()->forCustomer($customer)->create([
            'assigned_to_id' => $assignee->id,
            'created_by_id' => $assignee->id,
            'due_at' => now()->addHours(24),
            'status' => TaskStatus::Open,
        ]);
    }
}
