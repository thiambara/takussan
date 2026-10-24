<?php

namespace Tests\Feature\Console;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\Profiles\AgentProfile;
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
        // TCK-1706 — des émetteurs ACTIFS de l'agence du reversement : un émetteur sans profil y
        // cède désormais le rappel aux détenteurs de `payouts.create`.
        $agency = $this->moneyAgency();
        $scheduledIssuer = $this->agencyAgent($agency);
        $pendingIssuer = $this->agencyAgent($agency);
        $quiet = $this->agencyAgent($agency);

        $this->payout($scheduledIssuer, PayoutStatus::Scheduled, now()->subDay()->toDateTimeString(), $agency);
        $this->payout($pendingIssuer, PayoutStatus::Pending, now()->subDay()->toDateTimeString(), $agency);
        $this->payout($quiet, PayoutStatus::Scheduled, now()->addDay()->toDateTimeString(), $agency);
        $this->payout($quiet, PayoutStatus::Completed, now()->subDay()->toDateTimeString(), $agency);

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
        // Admin d'une AUTRE agence que celle du reversement : il n'en est pas le personnel, et le
        // rappel va aux détenteurs actifs de `payouts.create` de l'agence (TCK-1706).
        $ailleurs = $this->agencyAdmin($this->moneyAgency());
        $this->payout($ailleurs, PayoutStatus::Scheduled, $hier, $agency);

        $this->artisan('payouts:remind-due')->assertSuccessful();

        $chemin = function (User $user): ?string {
            $envoye = Notification::sent($user, CodedNotification::class)->first();

            return $envoye?->target['path'] ?? null;
        };
        $this->assertSame('/app/payments?tab=payouts', $chemin($agent));
        $this->assertSame('/app/agency/finances', $chemin($admin));
        $this->assertNull($chemin($ailleurs));
        Notification::assertSentToTimes($agent, CodedNotification::class, 2);
        Notification::assertSentToTimes($admin, CodedNotification::class, 2);
        foreach (Notification::sent($agent, CodedNotification::class) as $envoye) {
            $this->assertSame('/app/payments?tab=payouts', $envoye->target['path']);
        }
    }

    /**
     * TCK-1706 (P126.03) — le rappel n'allait qu'à `User::find($payout->issued_by_id)`, sans juger
     * son profil : un émetteur suspendu le recevait seul, et l'équipe active n'en savait rien. Un
     * émetteur qui n'est plus personnel actif tenant `payouts.create` cède le rappel aux détenteurs
     * actifs de la capacité dans l'agence du reversement.
     */
    public function test_un_emetteur_suspendu_cede_le_rappel_aux_detenteurs_actifs(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $suspendu = $this->agencyAgent($agency);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $admin = $this->agencyAdmin($agency);
        $collegue = $this->agencyAgent($agency);
        $this->payout($suspendu, PayoutStatus::Scheduled, now()->subDay()->toDateTimeString(), $agency);

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertNotSentTo($suspendu, CodedNotification::class);
        Notification::assertSentToTimes($admin, CodedNotification::class, 1);
        Notification::assertSentToTimes($collegue, CodedNotification::class, 1);
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
