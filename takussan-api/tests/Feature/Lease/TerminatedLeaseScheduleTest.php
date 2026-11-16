<?php

namespace Tests\Feature\Lease;

use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-607 (reliquat d'E11, contrainte 3) — les baux résiliés AVANT TCK-1151 (2026-10-21) ont gardé
 * leurs échéances postérieures à la sortie `pending`. L'état est construit tel quel (statut posé
 * sans passer par `terminate`), sinon ces tests seraient verts sans le correctif.
 *
 * - `ApplyLateFeesJob` et `SendLeasePaymentReminders` ne visent plus une échéance dont la période
 *   commence après la sortie d'un bail `terminated` ou `renewed` (`LeasePayment::withinLeaseTerm`) ;
 *   celles commencées au plus tard le jour de la sortie restent dues, relancées et pénalisables.
 * - `lease:cancel-dues-after-exit` les annule, `--dry-run` n'écrit rien, une seconde passe annule 0,
 *   et une échéance postérieure engagée est laissée et signalée.
 */
class TerminatedLeaseScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-09-20 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── Les jobs ────────────────────────────────────────────────────────────────────────────────

    public function test_la_penalite_ne_tombe_plus_apres_la_sortie_d_un_bail_resilie_avant_tck_1151(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);

        Carbon::setTestNow('2027-01-15 10:00:00');
        (new ApplyLateFeesJob)->handle(app(LateFeeCalculator::class));

        $rents = $this->rents($lease);
        // Dus avant la sortie (octobre commence le jour même) : pénalisés (décision E11).
        foreach (['2026-09-01', '2026-10-01'] as $start) {
            $this->assertNotNull($rents[$start]->late_fee_applied_at, $start);
        }
        // Postérieurs à la sortie : ni pénalité, toujours `pending` (la commande les annule).
        foreach (['2026-11-01', '2026-12-01', '2027-01-01'] as $start) {
            $this->assertNull($rents[$start]->late_fee_applied_at, $start);
            $this->assertSame(PaymentStatus::Pending, $rents[$start]->status, $start);
        }
    }

    public function test_la_relance_ne_vise_plus_une_echeance_posterieure_a_la_sortie(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);

        $ids = SendLeasePaymentReminders::remindable()->where('lease_id', $lease->id)->pluck('id');
        $rents = $this->rents($lease);

        $this->assertTrue($ids->contains($rents['2026-10-01']->id), 'octobre reste dû et relancé');
        $this->assertFalse($ids->contains($rents['2026-11-01']->id));
        $this->assertFalse($ids->contains($rents['2027-06-01']->id));
    }

    public function test_une_autre_dette_posterieure_a_la_sortie_reste_relancee(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);
        $regularisation = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => 'regularization',
            'status' => PaymentStatus::Pending,
            'amount' => 15_000,
            'due_date' => '2026-11-15',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
        ]);

        $this->assertTrue(SendLeasePaymentReminders::remindable()->whereKey($regularisation->id)->exists());
    }

    public function test_la_date_d_effet_du_preavis_fait_la_sortie(): void
    {
        $lease = $this->resilieALAncienne([
            'early_termination_effective_date' => '2026-12-05',
            'terminated_at' => '2026-12-06 09:00:00',
        ]);

        $ids = SendLeasePaymentReminders::remindable()->where('lease_id', $lease->id)->pluck('id');
        $rents = $this->rents($lease);

        $this->assertTrue($ids->contains($rents['2026-12-01']->id), 'décembre, à cheval, reste dû');
        $this->assertFalse($ids->contains($rents['2027-01-01']->id));
    }

    public function test_un_bail_renouvele_ne_relance_rien_apres_sa_fin(): void
    {
        $lease = $this->bailAvecEcheancier();
        $lease->forceFill(['status' => LeaseStatus::Renewed, 'end_date' => '2026-10-31'])->saveQuietly();

        $ids = SendLeasePaymentReminders::remindable()->where('lease_id', $lease->id)->pluck('id');
        $rents = $this->rents($lease);

        $this->assertTrue($ids->contains($rents['2026-10-01']->id));
        $this->assertFalse($ids->contains($rents['2026-11-01']->id));
    }

    public function test_un_bail_actif_reste_entierement_relance(): void
    {
        $lease = $this->bailAvecEcheancier();

        $this->assertSame(
            LeasePayment::query()->where('lease_id', $lease->id)->where('payment_type', 'rent')->count(),
            SendLeasePaymentReminders::remindable()->where('lease_id', $lease->id)->where('payment_type', 'rent')->count(),
        );
    }

    // ── La commande de reprise ──────────────────────────────────────────────────────────────────

    public function test_la_reprise_annule_les_echeances_posterieures_et_seulement_elles(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);

        $this->artisan('lease:cancel-dues-after-exit')->assertSuccessful();

        $rents = $this->rents($lease);
        foreach (['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'] as $start) {
            $this->assertSame(PaymentStatus::Pending, $rents[$start]->status, $start);
        }
        $this->assertSame(8, collect($rents)->where('status', PaymentStatus::Cancelled)->count());
        $this->assertSame(PaymentStatus::Cancelled, $rents['2026-11-01']->status);
        $this->assertSame(PaymentStatus::Cancelled, $rents['2027-06-01']->status);

        $log = Activity::query()->where('event', 'lease_termination_schedule_cancelled')->sole();
        $this->assertSame($lease->id, $log->subject_id);
        $this->assertSame('TCK-607', $log->properties['repair']);
        $this->assertCount(8, $log->properties['cancelled']);
    }

    public function test_le_dry_run_n_ecrit_rien(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);
        Queue::fake();

        $this->artisan('lease:cancel-dues-after-exit', ['--dry-run' => true])
            ->expectsOutputToContain("[dry-run, rien n'est écrit] 1 bail(s) touché(s), 8 échéance(s) annulée(s)")
            ->assertSuccessful();

        $this->assertSame(0, LeasePayment::query()->where('lease_id', $lease->id)->where('status', PaymentStatus::Cancelled->value)->count());
        $this->assertSame(0, Activity::query()->where('event', 'lease_termination_schedule_cancelled')->count());
        Queue::assertNothingPushed();
        Notification::assertNothingSent();
    }

    public function test_la_reprise_est_idempotente(): void
    {
        $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);

        $this->artisan('lease:cancel-dues-after-exit')->assertSuccessful();
        $this->artisan('lease:cancel-dues-after-exit')
            ->expectsOutputToContain('0 bail(s) touché(s), 0 échéance(s) annulée(s)')
            ->assertSuccessful();

        $this->assertSame(1, Activity::query()->where('event', 'lease_termination_schedule_cancelled')->count());
    }

    public function test_une_echeance_posterieure_engagee_est_laissee_et_signalee(): void
    {
        $lease = $this->resilieALAncienne(['terminated_at' => '2026-10-01 09:00:00']);
        $december = $this->rents($lease)['2026-12-01'];
        $december->forceFill(['status' => PaymentStatus::Paid])->save();

        $this->artisan('lease:cancel-dues-after-exit')
            ->expectsOutputToContain($december->reference_number)
            ->assertSuccessful();

        $rents = $this->rents($lease);
        $this->assertSame(PaymentStatus::Paid, $rents['2026-12-01']->status);
        $this->assertSame(7, collect($rents)->where('status', PaymentStatus::Cancelled)->count());
    }

    public function test_la_reprise_ne_touche_pas_un_bail_actif(): void
    {
        $lease = $this->bailAvecEcheancier();

        $this->artisan('lease:cancel-dues-after-exit')->assertSuccessful();

        $this->assertSame(0, LeasePayment::query()->where('lease_id', $lease->id)->where('status', PaymentStatus::Cancelled->value)->count());
    }

    // ── Outils ─────────────────────────────────────────────────────────────────────────────────

    private function bailAvecEcheancier(): Lease
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => Property::factory()->create(['user_id' => $landlord->id])->id,
            'tenant_id' => Customer::factory()->create()->id,
            'start_date' => '2026-07-01',
            'end_date' => '2027-06-30',
            'monthly_rent' => 100_000,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
            'late_fee_percent' => 10,
        ]);
        app(LeaseService::class)->generateSchedule($lease);

        return $lease->fresh();
    }

    /**
     * L'état d'un bail résilié avant TCK-1151 : statut posé, échéancier intact.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function resilieALAncienne(array $attributes): Lease
    {
        $lease = $this->bailAvecEcheancier();
        $lease->forceFill(['status' => LeaseStatus::Terminated, ...$attributes])->saveQuietly();
        $this->assertSame(0, LeasePayment::query()->where('lease_id', $lease->id)->where('status', PaymentStatus::Cancelled->value)->count());

        return $lease->fresh();
    }

    /** @return array<string, LeasePayment> par début de période */
    private function rents(Lease $lease): array
    {
        return LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('payment_type', 'rent')
            ->orderBy('period_start')
            ->get()
            ->keyBy(fn (LeasePayment $p) => $p->period_start->toDateString())
            ->all();
    }
}
