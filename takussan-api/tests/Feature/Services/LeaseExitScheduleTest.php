<?php

namespace Tests\Feature\Services;

use App\Exceptions\ApiError;
use App\Jobs\Lease\ApplyLateFeesJob;
use App\Jobs\Lease\ConfirmEarlyTerminationsJob;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-1151 (P81.01) — à la sortie du locataire, les échéances de loyer dont la période commence
 * après la date de sortie passent `cancelled` : ni pénalité, ni relance, ni paiement. Avant, la
 * résiliation immédiate et la confirmation de la résiliation anticipée ne touchaient à aucune
 * échéance, et `ApplyLateFeesJob` pénalisait des loyers postérieurs au départ.
 *
 * L'échéance à cheval sur la date de sortie reste due en entier (aucun prorata) ; une échéance
 * postérieure déjà engagée (réglée, en partie réglée, checkout ouvert) fait refuser la sortie,
 * comme `LeaseRenewalService::handOver` refuse un renouvellement.
 */
class LeaseExitScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-10-20 10:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_la_resiliation_immediate_annule_les_loyers_posterieurs_a_la_sortie(): void
    {
        [$lease, $landlord] = $this->leaseWithSchedule();

        app(LeaseService::class)->terminate($lease, $landlord, 'départ');

        $rents = $this->rents($lease);
        // Juillet à octobre (période commencée au plus tard le jour de la sortie) restent dus.
        foreach (['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'] as $start) {
            $this->assertSame(PaymentStatus::Pending, $rents[$start]->status, $start);
        }
        // Novembre 2026 à juin 2027 : postérieurs à la sortie.
        foreach (['2026-11-01', '2027-01-01', '2027-06-01'] as $start) {
            $this->assertSame(PaymentStatus::Cancelled, $rents[$start]->status, $start);
        }
        $this->assertSame(8, collect($rents)->where('status', PaymentStatus::Cancelled)->count());

        $log = Activity::query()->where('event', 'lease_termination_schedule_cancelled')->sole();
        $this->assertSame($lease->id, $log->subject_id);
        $this->assertCount(8, $log->properties['cancelled']);

        // Deux mois plus tard, la tâche des pénalités ne touche aucun loyer postérieur.
        Carbon::setTestNow('2027-01-15 10:00:00');
        (new ApplyLateFeesJob)->handle(app(LateFeeCalculator::class));
        $after = $this->rents($lease);
        foreach (['2026-11-01', '2026-12-01', '2027-01-01'] as $start) {
            $this->assertSame(PaymentStatus::Cancelled, $after[$start]->status, $start);
            $this->assertNull($after[$start]->late_fee_applied_at, $start);
        }
    }

    public function test_une_echeance_posterieure_deja_reglee_fait_refuser_la_resiliation(): void
    {
        [$lease, $landlord] = $this->leaseWithSchedule();
        $december = $this->rents($lease)['2026-12-01'];
        $december->forceFill(['status' => PaymentStatus::Paid])->save();

        try {
            app(LeaseService::class)->terminate($lease, $landlord);
            $this->fail('la résiliation devait être refusée');
        } catch (ApiError $e) {
            $this->assertSame(409, $e->getStatusCode());
            $this->assertSame('lease.termination_overlaps_paid_schedule', $e->errorCode);
        }

        $this->assertSame(LeaseStatus::Active, $lease->fresh()->status);
        $this->assertSame(0, LeasePayment::query()->where('status', PaymentStatus::Cancelled->value)->count());
    }

    public function test_la_confirmation_de_la_resiliation_anticipee_annule_les_loyers_apres_la_date_d_effet(): void
    {
        [$lease, $landlord] = $this->leaseWithSchedule();
        $service = app(EarlyTerminationService::class);
        // Date d'effet le 2026-12-05 : décembre est à cheval, janvier suit.
        $service->request($lease, $landlord, ['effective_date' => '2026-12-05']);
        Invoice::query()->findOrFail($lease->fresh()->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();

        Carbon::setTestNow('2026-12-06 10:00:00');
        $service->confirm($lease->fresh(), $landlord);

        $rents = $this->rents($lease);
        $this->assertSame(PaymentStatus::Pending, $rents['2026-11-01']->status);
        $this->assertSame(PaymentStatus::Pending, $rents['2026-12-01']->status);
        foreach (['2027-01-01', '2027-03-01', '2027-06-01'] as $start) {
            $this->assertSame(PaymentStatus::Cancelled, $rents[$start]->status, $start);
        }
        $this->assertSame(6, collect($rents)->where('status', PaymentStatus::Cancelled)->count());

        Carbon::setTestNow('2027-03-15 10:00:00');
        (new ApplyLateFeesJob)->handle(app(LateFeeCalculator::class));
        $this->assertNull($this->rents($lease)['2027-02-01']->late_fee_applied_at);
    }

    public function test_la_tache_de_confirmation_laisse_en_preavis_un_bail_dont_un_loyer_posterieur_est_regle(): void
    {
        [$lease, $landlord] = $this->leaseWithSchedule();
        $service = app(EarlyTerminationService::class);
        $service->request($lease, $landlord, ['effective_date' => '2026-12-05']);
        Invoice::query()->findOrFail($lease->fresh()->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();
        $this->rents($lease)['2027-02-01']
            ->forceFill(['status' => PaymentStatus::PartiallyPaid, 'metadata' => ['paid_amount' => 10_000]])->save();

        Carbon::setTestNow('2026-12-06 10:00:00');
        $confirmed = (new ConfirmEarlyTerminationsJob)->handle($service);

        $this->assertSame(0, $confirmed);
        $this->assertSame(LeaseStatus::Terminating, $lease->fresh()->status);
        $this->assertSame(0, LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('status', PaymentStatus::Cancelled->value)
            ->count());
    }

    /**
     * Bail de douze mois (juillet 2026 à juin 2027) à 100 000, pénalité de 10 %, échéancier émis.
     *
     * @return array{0: Lease, 1: User}
     */
    private function leaseWithSchedule(): array
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

        return [$lease->fresh(), $landlord];
    }

    /**
     * @return array<string, LeasePayment> par début de période
     */
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
