<?php

namespace Tests\Feature\Jobs;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Model\LeaseService;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GenerateLeasePaymentScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_generates_schedule_if_no_payments_exist(): void
    {
        $lease = Lease::factory()->create([
            'start_date' => now()->startOfMonth(),
            'end_date' => now()->startOfMonth()->addMonths(3),
            'monthly_rent' => 100000,
            'status' => LeaseStatus::Active->value,
        ]);

        $this->assertEquals(0, LeasePayment::where('lease_id', $lease->id)->count());

        $job = new GenerateLeasePaymentSchedule($lease);
        app()->call([$job, 'handle']);

        $this->assertTrue(LeasePayment::where('lease_id', $lease->id)->count() > 0);
    }

    public function test_it_does_not_duplicate_schedule_if_already_generated(): void
    {
        $lease = Lease::factory()->create();
        LeasePayment::factory()->count(2)->create(['lease_id' => $lease->id]);

        $initialCount = LeasePayment::where('lease_id', $lease->id)->count();

        $job = new GenerateLeasePaymentSchedule($lease);
        app()->call([$job, 'handle']);

        $this->assertEquals($initialCount, LeasePayment::where('lease_id', $lease->id)->count());
    }

    private function activeLease(): Lease
    {
        return Lease::factory()->create([
            'start_date' => now()->startOfMonth(),
            'end_date' => now()->startOfMonth()->addMonths(3),
            'monthly_rent' => 100000,
            'status' => LeaseStatus::Active->value,
        ]);
    }

    /**
     * VERIF-596 (hors diff, fermé ici) — « aucune échéance » se juge sous le verrou de la ligne
     * `leases`, dans la transaction qui écrit l'échéancier. Il se jugeait AVANT la transaction et
     * sans verrou : une génération manuelle concurrente de la tâche lisait, comme elle, zéro
     * échéance, et l'échéancier était créé deux fois. Une concurrence réelle ne se rejoue pas sur
     * une seule connexion : on lit l'ordre et la profondeur de transaction des requêtes émises.
     *
     * @return list<array{0: string, 1: int}>
     */
    private function queriesOf(callable $generate): array
    {
        $queries = [];
        DB::listen(function (QueryExecuted $q) use (&$queries): void {
            $queries[] = [strtolower($q->sql), DB::transactionLevel()];
        });
        $generate();

        return $queries;
    }

    private function assertCheckedUnderTheLeaseLock(array $queries): void
    {
        $lock = $count = $insert = null;
        foreach ($queries as $i => [$sql]) {
            if ($lock === null && str_contains($sql, 'from "leases"') && str_contains($sql, 'for update')) {
                $lock = $i;
            }
            if ($count === null && str_contains($sql, 'count(*)') && str_contains($sql, '"lease_payments"')) {
                $count = $i;
            }
            if ($insert === null && str_starts_with($sql, 'insert into "lease_payments"')) {
                $insert = $i;
            }
        }

        $this->assertNotNull($lock, 'la ligne du bail n\'est pas verrouillée');
        $this->assertNotNull($count);
        $this->assertNotNull($insert);
        $this->assertLessThan($count, $lock, 'le contrôle « aucune échéance » précède le verrou');
        $this->assertSame($queries[$lock][1], $queries[$count][1], 'contrôle et verrou dans deux transactions');
        $this->assertSame($queries[$lock][1], $queries[$insert][1], 'contrôle et écriture dans deux transactions');
    }

    public function test_the_job_checks_for_payments_under_the_lease_row_lock(): void
    {
        $lease = $this->activeLease();

        $this->assertCheckedUnderTheLeaseLock($this->queriesOf(fn () => app()->call([new GenerateLeasePaymentSchedule($lease), 'handle'])));
    }

    public function test_the_route_checks_for_payments_under_the_lease_row_lock(): void
    {
        $lease = $this->activeLease();
        Sanctum::actingAs($lease->landlord);

        $this->assertCheckedUnderTheLeaseLock($this->queriesOf(
            fn () => $this->postJson("/api/leases/{$lease->id}/payments/generate-schedule")->assertOk()
        ));
    }

    /** Deux générations périmées (bail lu avant l'une et l'autre) : un seul échéancier, et la tâche se tait. */
    public function test_two_stale_generations_leave_a_single_schedule(): void
    {
        $lease = $this->activeLease();
        $readByJob = Lease::query()->findOrFail($lease->id);
        $readByRoute = Lease::query()->findOrFail($lease->id);

        $created = app(LeaseService::class)->generateSchedule($readByRoute);
        app()->call([new GenerateLeasePaymentSchedule($readByJob), 'handle']);

        $this->assertGreaterThan(0, $created);
        $this->assertSame($created, LeasePayment::query()->where('lease_id', $lease->id)->count());
        $this->assertSame($created, LeasePayment::query()->where('lease_id', $lease->id)->distinct()->count('due_date'));
    }

    /**
     * P04.01 (TCK-667) — une échéance couvre toute sa période et en facture chaque mois : loyer
     * mensuel × mois de la période. Un échéancier trimestriel facturait un seul mois par trimestre,
     * daté du seul mois de l'échéance.
     *
     * @return list<array{0: string, 1: string, 2: float}>
     */
    private function scheduleOf(PaymentFrequency $frequency, string $end): array
    {
        $lease = Lease::factory()->create([
            'start_date' => '2026-01-01',
            'end_date' => $end,
            'monthly_rent' => 100000,
            'payment_day' => 1,
            'payment_frequency' => $frequency->value,
            'status' => LeaseStatus::Active->value,
        ]);

        app(LeaseService::class)->generateSchedule($lease);

        return LeasePayment::query()->where('lease_id', $lease->id)->orderBy('due_date')->get()
            ->map(fn (LeasePayment $p): array => [$p->period_start->toDateString(), $p->period_end->toDateString(), (float) $p->amount])
            ->all();
    }

    public function test_a_monthly_schedule_bills_one_month_per_period(): void
    {
        $schedule = $this->scheduleOf(PaymentFrequency::Monthly, '2026-12-31');

        $this->assertCount(12, $schedule);
        $this->assertSame(['2026-01-01', '2026-01-31', 100000.0], $schedule[0]);
        $this->assertSame(['2026-12-01', '2026-12-31', 100000.0], $schedule[11]);
        $this->assertSame(1200000.0, array_sum(array_column($schedule, 2)));
    }

    public function test_a_quarterly_schedule_bills_three_months_per_period(): void
    {
        $this->assertSame([
            ['2026-01-01', '2026-03-31', 300000.0],
            ['2026-04-01', '2026-06-30', 300000.0],
            ['2026-07-01', '2026-09-30', 300000.0],
            ['2026-10-01', '2026-12-31', 300000.0],
        ], $this->scheduleOf(PaymentFrequency::Quarterly, '2026-12-31'));
    }

    public function test_a_yearly_schedule_bills_twelve_months_per_period(): void
    {
        $this->assertSame([
            ['2026-01-01', '2026-12-31', 1200000.0],
        ], $this->scheduleOf(PaymentFrequency::Yearly, '2026-12-31'));
    }

    /** La dernière période s'arrête au mois de fin du bail : aucun mois après le bail n'est facturé. */
    public function test_the_last_period_stops_at_the_lease_end_month(): void
    {
        $this->assertSame([
            ['2026-01-01', '2026-03-31', 300000.0],
            ['2026-04-01', '2026-06-30', 300000.0],
            ['2026-07-01', '2026-09-30', 300000.0],
            ['2026-10-01', '2026-10-31', 100000.0],
        ], $this->scheduleOf(PaymentFrequency::Quarterly, '2026-10-31'));
    }

    /**
     * P46.04 (TCK-957) — l'échéancier ne compte que les échéances de loyer qu'il émet. Il comptait
     * toutes les lignes du bail : une caution saisie avant l'activation faisait taire la tâche
     * (0 échéance de loyer) et refuser le bouton manuel par `lease.schedule_exists`.
     */
    public function test_a_deposit_line_does_not_count_as_an_existing_schedule(): void
    {
        $lease = $this->activeLease();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Deposit,
            'status' => PaymentStatus::Pending,
        ]);

        $witness = app(LeaseService::class)->generateSchedule($this->activeLease());
        $created = app(LeaseService::class)->generateScheduleIfMissing($lease);

        $this->assertGreaterThan(0, $witness);
        $this->assertSame($witness, $created);
        $this->assertSame($witness, $lease->payments()->where('payment_type', LeasePaymentType::Rent->value)->count());
    }

    /** P46.04 (TCK-957) — une échéance de loyer annulée (par un renouvellement) n'est plus due. */
    public function test_a_cancelled_rent_line_does_not_count_as_an_existing_schedule(): void
    {
        $lease = $this->activeLease();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Cancelled,
        ]);

        $witness = app(LeaseService::class)->generateSchedule($this->activeLease());

        $this->assertGreaterThan(0, $witness);
        $this->assertSame($witness, app(LeaseService::class)->generateSchedule($lease));
    }

    /** P46.04 (TCK-957) — une échéance de loyer due bloque toujours une seconde génération. */
    public function test_a_live_rent_line_still_counts_as_an_existing_schedule(): void
    {
        $lease = $this->activeLease();
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Pending,
        ]);

        $this->assertSame(0, app(LeaseService::class)->generateScheduleIfMissing($lease));
        $this->assertSame(1, $lease->payments()->count());
    }
}
