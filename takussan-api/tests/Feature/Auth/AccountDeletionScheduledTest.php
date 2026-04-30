<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AccountDeletionScheduledTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_only_executes_due_requests(): void
    {
        Notification::fake();

        $userDue = User::factory()->create();
        AccountDeletionRequest::factory()->for($userDue)->due()->create();

        $userPending = User::factory()->create();
        AccountDeletionRequest::factory()->for($userPending)->create([
            'scheduled_for' => now()->addDays(20),
        ]);

        $this->artisan('account:execute-deletions')->assertExitCode(0);

        // Due request executed: user soft-deleted.
        $freshDue = User::withTrashed()->find($userDue->id);
        $this->assertNotNull($freshDue->deleted_at);
        $this->assertSame(UserStatus::Deleted->value, $freshDue->status->value);

        // Pending request untouched.
        $this->assertNotNull(User::query()->find($userPending->id));
        $this->assertNull($userPending->fresh()->deleted_at);
    }

    public function test_command_sends_reminder_for_requests_within_j_minus_7(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->create([
            'requested_at' => now()->subDays(24),
            // Within the 7-day reminder window, not yet due.
            'scheduled_for' => now()->addDays(5),
            'reminder_sent_at' => null,
        ]);

        $this->artisan('account:execute-deletions')->assertExitCode(0);

        Notification::assertSentTo($user, AccountDeletionReminderNotification::class);
        $this->assertNotNull($request->fresh()->reminder_sent_at);
    }

    public function test_reminder_is_idempotent(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        AccountDeletionRequest::factory()->for($user)->create([
            'scheduled_for' => now()->addDays(5),
            'reminder_sent_at' => now()->subHour(),
        ]);

        $this->artisan('account:execute-deletions')->assertExitCode(0);

        Notification::assertNothingSentTo($user);
    }

    public function test_dry_run_does_not_mutate_state(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        AccountDeletionRequest::factory()->for($user)->due()->create();

        $this->artisan('account:execute-deletions', ['--dry-run' => true])->assertExitCode(0);

        $this->assertNotNull(User::query()->find($user->id));
        Notification::assertNothingSentTo($user);
    }
}
