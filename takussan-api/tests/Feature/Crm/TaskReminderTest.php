<?php

namespace Tests\Feature\Crm;

use App\Jobs\SendTaskDueReminders;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskDueReminderNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
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

    /** TCK-1350 (P88.04) — un compte bloqué ou supprimé ne reçoit pas de rappel de tâche. */
    public function test_does_not_remind_a_blocked_or_deleted_assignee(): void
    {
        Notification::fake();

        foreach ([UserStatus::Blocked, UserStatus::Deleted] as $status) {
            $user = User::factory()->create(['status' => $status]);
            $customer = Customer::factory()->create(['added_by_id' => $user->id]);
            $this->dueTaskFor($customer, $user);
        }

        (new SendTaskDueReminders)->handle();

        Notification::assertNothingSent();
    }

    /**
     * TCK-1529 (P169.02) — la marque vaut pour l'échéance et l'assigné qu'elle a rappelés : une
     * tâche repoussée et réassignée par `PATCH /api/tasks/{id}` après son rappel est rappelée au
     * nouvel assigné, 24 h avant sa nouvelle échéance.
     */
    public function test_a_postponed_and_reassigned_task_is_reminded_to_the_new_assignee(): void
    {
        Notification::fake();

        [$agency, $customer] = $this->agencyCustomer();
        $first = $this->agentOf($agency, AgentProfileStatus::Active);
        $second = $this->agentOf($agency, AgentProfileStatus::Active);
        $task = $this->dueTaskFor($customer, $first);

        (new SendTaskDueReminders)->handle();
        Notification::assertSentToTimes($first, TaskDueReminderNotification::class, 1);

        Sanctum::actingAs($first);
        $this->patchJson("/api/tasks/{$task->id}", [
            'due_at' => now()->addDays(5)->toIso8601String(),
            'assigned_to_id' => $second->id,
        ])->assertOk();
        $this->assertSame($second->id, $task->fresh()->assigned_to_id);

        $this->travel(4)->days();
        (new SendTaskDueReminders)->handle();

        Notification::assertSentToTimes($second, TaskDueReminderNotification::class, 1);
        Notification::assertSentToTimes($first, TaskDueReminderNotification::class, 1);
    }

    /** TCK-1529 (P169.02) — repoussée seule, la tâche est rappelée de nouveau à son assigné. */
    public function test_a_postponed_task_is_reminded_again_before_its_new_due_date(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $task = $this->dueTaskFor($customer, $user);

        (new SendTaskDueReminders)->handle();

        Sanctum::actingAs($user);
        $this->patchJson("/api/tasks/{$task->id}", ['due_at' => now()->addDays(5)->toIso8601String()])->assertOk();

        $this->travel(4)->days();
        (new SendTaskDueReminders)->handle();

        Notification::assertSentToTimes($user, TaskDueReminderNotification::class, 2);
    }

    /** TCK-1529 (P169.02) — une modification qui ne touche ni l'échéance ni l'assigné garde la marque. */
    public function test_an_edit_that_keeps_due_date_and_assignee_keeps_the_marker(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $user->id]);
        $task = $this->dueTaskFor($customer, $user);

        (new SendTaskDueReminders)->handle();

        Sanctum::actingAs($user);
        $this->patchJson("/api/tasks/{$task->id}", ['title' => 'Rappeler le client'])->assertOk();
        (new SendTaskDueReminders)->handle();

        Notification::assertSentToTimes($user, TaskDueReminderNotification::class, 1);
        $this->assertNotNull($task->fresh()->metadata[SendTaskDueReminders::META_MARKER] ?? null);
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
