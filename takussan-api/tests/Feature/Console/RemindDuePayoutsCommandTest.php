<?php

namespace Tests\Feature\Console;

use App\Models\Agency;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC20) — un reversement programmé échu se rappelle à son émetteur, une fois.
 */
class RemindDuePayoutsCommandTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function payout(User $issuer, PayoutStatus $status, string $scheduledAt, ?Agency $agency = null): Payout
    {
        $agency ??= $this->moneyAgency();

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

    /**
     * TCK-1467 (P161.01) — la cible suit le destinataire : `/app/agency/finances` est fermée à qui
     * n'est pas admin de l'agence ; l'agent qui a programmé le reversement est mené à l'onglet des
     * reversements de `/app/payments`, où il l'a émis.
     */
    public function test_la_cible_du_rappel_suit_l_emetteur(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agent = $this->agencyAgent($agency);
        $admin = $this->agencyAdmin($agency);
        $hier = now()->subDay()->toDateTimeString();
        $this->payout($agent, PayoutStatus::Scheduled, $hier, $agency);
        $this->payout($admin, PayoutStatus::Scheduled, $hier, $agency);
        // Admin d'une AUTRE agence que celle du reversement : il n'ouvre pas les finances de celle-ci.
        $ailleurs = $this->agencyAdmin($this->moneyAgency());
        $this->payout($ailleurs, PayoutStatus::Scheduled, $hier, $agency);

        $this->artisan('payouts:remind-due')->assertSuccessful();

        $chemin = function (User $user): ?string {
            $envoye = Notification::sent($user, CodedNotification::class)->first();

            return $envoye?->target['path'] ?? null;
        };
        $this->assertSame('/app/payments?tab=payouts', $chemin($agent));
        $this->assertSame('/app/agency/finances', $chemin($admin));
        $this->assertSame('/app/payments?tab=payouts', $chemin($ailleurs));
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
