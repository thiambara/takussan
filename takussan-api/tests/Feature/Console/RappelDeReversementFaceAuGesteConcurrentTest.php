<?php

namespace Tests\Feature\Console;

use App\Models\Agency;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use App\Notifications\CodedNotification;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P245.01 (TCK-2362) — `payouts:remind-due` lit ses reversements échus en lot, puis réécrivait
 * `metadata` depuis le modèle chargé et envoyait le rappel sans rien rejuger : un reversement payé
 * pendant son passage perdait la trace du décaissement (`destination_masked`, que lit sa fiche), et
 * son émetteur recevait « reversement échu » pour un reversement soldé.
 *
 * Le geste concurrent est joué une fois, dans l'écouteur `retrieved` du modèle, après la lecture du
 * lot et avant l'écriture.
 */
class RappelDeReversementFaceAuGesteConcurrentTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private User $emetteur;

    private Payout $reversement;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = $this->moneyAgency();
        $this->emetteur = $this->agencyAgent($agency);
        $this->reversement = $this->reversementEchu($agency);
    }

    private function reversementEchu(Agency $agency): Payout
    {
        return Payout::factory()->create([
            'agency_id' => $agency->id,
            'landlord_id' => $this->landlordOf($agency)->id,
            'issued_by_id' => $this->emetteur->id,
            'status' => PayoutStatus::Pending,
            'scheduled_at' => now()->subDay()->toDateTimeString(),
            'metadata' => ['approved_net_amount' => '100000.00'],
        ]);
    }

    private function pendantLaLecture(Closure $geste): void
    {
        $joue = false;
        Payout::retrieved(function () use (&$joue, $geste): void {
            if ($joue) {
                return;
            }
            $joue = true;
            $geste();
        });
    }

    private function enBase(array $colonnes): void
    {
        if (array_key_exists('metadata', $colonnes)) {
            $colonnes['metadata'] = json_encode($colonnes['metadata']);
        }
        DB::table('payouts')->where('id', $this->reversement->id)->update($colonnes);
    }

    public function test_un_reversement_paye_pendant_le_passage_garde_sa_trace_et_n_est_pas_rappele(): void
    {
        Notification::fake();
        $trace = [
            'approved_net_amount' => '100000.00',
            'disbursement_driver' => 'manual',
            'destination_kind' => 'mobile_money',
            'destination_masked' => '•••• 4567',
        ];

        $this->pendantLaLecture(fn () => $this->enBase([
            'status' => PayoutStatus::Completed->value,
            'processed_at' => now(),
            'metadata' => $trace,
        ]));

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertNothingSent();
        $frais = $this->reversement->fresh();
        $this->assertSame(PayoutStatus::Completed, $frais->status);
        // `jsonb` ne garde pas l'ordre des clés.
        $this->assertEquals($trace, $frais->metadata);
    }

    public function test_un_reversement_reprogramme_pendant_le_passage_n_est_pas_rappele(): void
    {
        Notification::fake();

        $this->pendantLaLecture(fn () => $this->enBase([
            'status' => PayoutStatus::Scheduled->value,
            'scheduled_at' => now()->addWeek(),
        ]));

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertNothingSent();
        $this->assertArrayNotHasKey('due_reminded_at', $this->reversement->fresh()->metadata);
    }

    public function test_le_marqueur_s_ecrit_sur_la_metadata_relue(): void
    {
        Notification::fake();

        $this->pendantLaLecture(fn () => $this->enBase([
            'metadata' => ['approved_net_amount' => '100000.00', 'autre' => 'écrit entre-temps'],
        ]));

        $this->artisan('payouts:remind-due')->assertSuccessful();

        Notification::assertSentToTimes($this->emetteur, CodedNotification::class, 1);
        $metadata = $this->reversement->fresh()->metadata;
        $this->assertSame('écrit entre-temps', $metadata['autre']);
        $this->assertSame('100000.00', $metadata['approved_net_amount']);
        $this->assertArrayHasKey('due_reminded_at', $metadata);
    }
}
