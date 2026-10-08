<?php

namespace Tests\Feature\Console;

use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-594 (AC20) — un reversement programmé échu se rappelle à son émetteur, une fois.
 */
class RemindDuePayoutsCommandTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private function payout(User $issuer, PayoutStatus $status, string $scheduledAt): Payout
    {
        $agency = $this->moneyAgency();

        return Payout::factory()->create([
            'agency_id' => $agency->id,
            'landlord_id' => $this->landlordOf($agency)->id,
            'issued_by_id' => $issuer->id,
            'status' => $status,
            'scheduled_at' => $scheduledAt,
            'metadata' => null,
        ]);
    }

    public function test_ac20_each_due_payout_reminds_its_issuer_once(): void
    {
        Notification::fake();
        $scheduledIssuer = User::factory()->create();
        $pendingIssuer = User::factory()->create();
        $quiet = User::factory()->create();

        $this->payout($scheduledIssuer, PayoutStatus::Scheduled, now()->subDay()->toDateTimeString());
        $this->payout($pendingIssuer, PayoutStatus::Pending, now()->subDay()->toDateTimeString());
        $this->payout($quiet, PayoutStatus::Scheduled, now()->addDay()->toDateTimeString());
        $this->payout($quiet, PayoutStatus::Completed, now()->subDay()->toDateTimeString());

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertSentToTimes($scheduledIssuer, CodedNotification::class, 1);
        Notification::assertSentToTimes($pendingIssuer, CodedNotification::class, 1);
        Notification::assertNotSentTo($quiet, CodedNotification::class);
        Notification::assertCount(2);

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertCount(2);
    }

    public function test_ac20_the_command_is_scheduled_daily(): void
    {
        $events = array_filter(
            app(Schedule::class)->events(),
            static fn (Event $e): bool => str_contains((string) $e->command, 'payouts:remind-due'),
        );

        $this->assertCount(1, $events, 'la commande doit être planifiée une fois dans routes/console.php');
        $this->assertSame('30 7 * * *', array_values($events)[0]->expression);
        $this->assertSame('Africa/Dakar', array_values($events)[0]->timezone);
    }
}
