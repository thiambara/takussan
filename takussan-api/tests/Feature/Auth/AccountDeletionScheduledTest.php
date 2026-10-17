<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
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

    /**
     * TCK-741 (P05.04) — une suppression qui lève ne bloque pas les suivantes, et son journal ne
     * porte que la forme sûre de l'exception (ADR-0044), jamais son message.
     */
    public function test_tck741_une_suppression_en_echec_ne_bloque_pas_les_suivantes(): void
    {
        Notification::fake();
        Log::spy();
        $enEchec = AccountDeletionRequest::factory()->for(User::factory())->create(['scheduled_for' => now()->subDays(2)]);
        $suivante = AccountDeletionRequest::factory()->for(User::factory())->create(['scheduled_for' => now()->subDay()]);
        $this->partialMock(AccountDeletionService::class, function ($mock) use ($enEchec): void {
            $mock->shouldReceive('executeDeletion')
                ->withArgs(fn (AccountDeletionRequest $r): bool => $r->id === $enEchec->id)
                ->once()
                ->andThrow(new \RuntimeException('donnée personnelle dans le message'));
            $mock->shouldReceive('executeDeletion')
                ->withArgs(fn (AccountDeletionRequest $r): bool => $r->id !== $enEchec->id)
                ->passthru();
        });

        $this->artisan('account:execute-deletions')->assertExitCode(1);

        $this->assertNotNull($suivante->fresh()->executed_at);
        $this->assertNull($enEchec->fresh()->executed_at);
        Log::shouldHaveReceived('error')->withArgs(function (string $message, array $context) use ($enEchec): bool {
            return ($context['exception'] ?? null) === \RuntimeException::class
                && ($context['account_deletion_request_id'] ?? null) === $enEchec->id
                && ! str_contains(json_encode($context) ?: '', 'donnée personnelle');
        })->once();
    }

    public function test_tck741_les_demandes_echues_sont_rendues_par_date_prevue(): void
    {
        $tardive = AccountDeletionRequest::factory()->for(User::factory())->create(['scheduled_for' => now()->subDay()]);
        $ancienne = AccountDeletionRequest::factory()->for(User::factory())->create(['scheduled_for' => now()->subDays(3)]);

        $this->assertSame(
            [$ancienne->id, $tardive->id],
            app(AccountDeletionService::class)->dueForExecution()->pluck('id')->all(),
        );
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
