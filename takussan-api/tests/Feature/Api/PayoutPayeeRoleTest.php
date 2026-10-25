<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Payout;
use App\Services\Lease\DepositRefundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC4, AC23) — la caution rendue au locataire n'est pas un reversement au bailleur.
 */
class PayoutPayeeRoleTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac4_ac23_a_deposit_refund_is_a_tenant_payout_and_the_landlord_filter_excludes_it(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord);
        $lease->forceFill(['status' => LeaseStatus::Terminated, 'deposit_amount' => 400_000])->save();
        $admin = $this->agencyAdmin($agency);

        $refund = app(DepositRefundService::class)->refund($lease->fresh(), $admin, ['amount' => 400_000])['payout'];
        $this->assertSame('tenant', $refund->payee_role->value);

        Sanctum::actingAs($landlord);
        $base = "/api/payouts?filter[landlord_id]={$landlord->id}&filter[status]=pending";

        $this->getJson($base.'&filter[payee_role]=landlord')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson($base)->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.payee_role', 'tenant');
    }

    public function test_ac4_a_refunded_deposit_never_enters_the_preparation(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord);
        $this->leasePayment($lease, 400_000, LeasePaymentType::DepositRefund);
        $this->leasePayment($lease, 400_000, LeasePaymentType::Deposit);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2026-09-01&period_end=2026-09-30")
            ->assertOk()
            ->assertJsonPath('data.totals.gross', 0);
    }

    public function test_ac23_the_data_migration_moves_existing_deposit_refunds_to_tenant(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $at = now()->setTime(10, 0, 0);

        // Deux remboursements de caution écrits comme le faisait le code d'avant : un `Payout` sans
        // `payee_role`, joint à son `LeasePayment` `deposit_refund` (même bail, montant, seconde).
        foreach ([300_000, 150_000] as $amount) {
            $lease = $this->leaseOf($agency, $landlord);
            $this->leasePayment($lease, $amount, LeasePaymentType::DepositRefund, null, PaymentStatus::Pending)
                ->forceFill(['created_at' => $at])->saveQuietly();
            Payout::factory()->create([
                'lease_id' => $lease->id, 'agency_id' => $agency->id, 'landlord_id' => $landlord->id,
                'gross_amount' => $amount, 'commission_amount' => 0, 'net_amount' => $amount,
                'created_at' => $at,
            ]);
        }
        // Un reversement ordinaire du même jour, du même bail, d'un autre montant.
        Payout::factory()->create([
            'lease_id' => $lease->id, 'agency_id' => $agency->id, 'landlord_id' => $landlord->id,
            'net_amount' => 198_000, 'created_at' => $at,
        ]);
        DB::table('payouts')->update(['payee_role' => 'landlord']);

        (require database_path('migrations/2026_10_07_200300_backfill_tenant_payee_role_on_deposit_refund_payouts.php'))->up();

        $this->assertSame(2, Payout::query()->where('payee_role', 'tenant')->count());
        $this->assertSame(1, Payout::query()->where('payee_role', 'landlord')->count());
    }
}
