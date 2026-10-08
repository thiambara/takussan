<?php

namespace Tests\Feature\Database;

use App\Jobs\Lease\ApplyLateFeesJob;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-593 (AC9) — les échéances déjà `failed` repassent `pending`, et le calculateur de pénalités
 * les reprend. `down()` ne restaure que les lignes marquées, restées `pending`.
 */
class ReopenFailedLeasePaymentsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_07_150100_reopen_failed_lease_payments.php');
    }

    public function test_une_echeance_failed_est_rouverte_puis_penalisee(): void
    {
        $lease = Lease::factory()->create(['late_fee_percent' => 5, 'late_fee_grace_days' => 0]);
        $failed = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(7)->toDateString(),
            'status' => PaymentStatus::Failed,
        ]);
        $paid = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id]);

        $this->migration()->up();

        $failed->refresh();
        $this->assertSame(PaymentStatus::Pending, $failed->status);
        $this->assertNotEmpty($failed->metadata['reopened_from_failed_at'] ?? null);
        $this->assertSame(PaymentStatus::Paid, $paid->refresh()->status);
        $this->assertArrayNotHasKey('reopened_from_failed_at', $paid->metadata ?? []);

        app()->call([new ApplyLateFeesJob, 'handle']);

        $failed->refresh();
        $this->assertSame(PaymentStatus::Late, $failed->status);
        $this->assertSame('5000.00', (string) $failed->late_fee_amount);
    }

    public function test_down_ne_restaure_que_les_lignes_marquees_restees_pending(): void
    {
        $reopened = LeasePayment::factory()->create(['status' => PaymentStatus::Failed]);
        $paidSince = LeasePayment::factory()->create(['status' => PaymentStatus::Failed]);
        $neverFailed = LeasePayment::factory()->create(['status' => PaymentStatus::Pending]);

        $this->migration()->up();
        DB::table('lease_payments')->where('id', $paidSince->id)->update(['status' => 'paid']);

        $this->migration()->down();

        $this->assertSame(PaymentStatus::Failed, $reopened->refresh()->status);
        $this->assertSame(PaymentStatus::Paid, $paidSince->refresh()->status);
        $this->assertSame(PaymentStatus::Pending, $neverFailed->refresh()->status);
        $this->assertArrayNotHasKey('reopened_from_failed_at', $reopened->metadata ?? []);
        $this->assertArrayNotHasKey('reopened_from_failed_at', $paidSince->metadata ?? []);
    }
}
