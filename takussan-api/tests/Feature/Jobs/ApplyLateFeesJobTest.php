<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Lease\ApplyLateFeesJob;
use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\SettingScope;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Setting;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ApplyLateFeesJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_applies_fee_once_per_payment(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(7)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $job = new ApplyLateFeesJob;
        $first = app()->call([$job, 'handle']);
        $payment->refresh();

        $this->assertSame(1, $first);
        $this->assertSame('5000.00', (string) $payment->late_fee_amount);
        $this->assertNotNull($payment->late_fee_applied_at);
        $this->assertSame(PaymentStatus::Late, $payment->status);

        // Second run is a no-op: idempotence via late_fee_applied_at.
        $second = app()->call([$job, 'handle']);
        $this->assertSame(0, $second);
    }

    /**
     * TCK-779 (P02.13) — le plafond de l'agence se lit une fois par passage, et non à chaque
     * échéance (une à deux lectures de `settings` chacune avant), pour la même pénalité.
     */
    public function test_le_plafond_de_l_agence_est_lu_une_fois_par_passage(): void
    {
        $agence = Agency::factory()->create();
        Setting::query()->create(['key' => 'late_fees.cap_percent', 'value' => ['value' => 3], 'scope' => SettingScope::Agency, 'scope_id' => $agence->id]);
        $bail = Lease::factory()->create(['agency_id' => $agence->id, 'late_fee_percent' => 10, 'late_fee_grace_days' => 0]);
        $echeances = collect(range(1, 3))->map(fn (int $i) => LeasePayment::factory()->create([
            'lease_id' => $bail->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(3 + $i)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]));

        $lectures = 0;
        DB::listen(function (QueryExecuted $q) use (&$lectures) {
            if (preg_match('/from "settings" where "key" = \? and "scope" = \? and "scope_id" = \?/', $q->sql) === 1) {
                $lectures++;
            }
        });

        $this->assertSame(3, app()->call([new ApplyLateFeesJob, 'handle']));

        $this->assertSame(1, $lectures, 'la ligne de l\'agence est relue à chaque échéance');
        foreach ($echeances as $echeance) {
            $this->assertSame('3000.00', (string) $echeance->fresh()->late_fee_amount, 'plafonnée à 3 % de 100 000');
        }
    }

    public function test_processes_multiple_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $leaseA = Lease::factory()->create([
            'agency_id' => $agencyA->id,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $leaseB = Lease::factory()->create([
            'agency_id' => $agencyB->id,
            'late_fee_percent' => 10,
            'late_fee_grace_days' => 0,
        ]);

        $paymentA = LeasePayment::factory()->create([
            'lease_id' => $leaseA->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);
        $paymentB = LeasePayment::factory()->create([
            'lease_id' => $leaseB->id,
            'amount' => 200_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $applied = app()->call([new ApplyLateFeesJob, 'handle']);

        $this->assertSame(2, $applied);
        $this->assertSame('5000.00', (string) $paymentA->fresh()->late_fee_amount);
        $this->assertSame('20000.00', (string) $paymentB->fresh()->late_fee_amount);
    }

    public function test_skips_leases_without_late_fee_percent(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => null,
            'late_fee_grace_days' => 5,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(30)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $applied = app()->call([new ApplyLateFeesJob, 'handle']);

        $this->assertSame(0, $applied);
        $this->assertNull($payment->fresh()->late_fee_amount);
        $this->assertNull($payment->fresh()->late_fee_applied_at);
    }
}
