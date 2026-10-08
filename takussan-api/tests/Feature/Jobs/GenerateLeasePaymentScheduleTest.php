<?php

namespace Tests\Feature\Jobs;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Enums\LeaseStatus;
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
}
