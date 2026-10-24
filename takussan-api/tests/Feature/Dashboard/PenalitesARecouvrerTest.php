<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P206.03 (ADR-0057, amendement du 2026-10-24, point 3) — les pénalités appliquées et non réglées
 * forment un total à part, « pénalités à recouvrer », rendu par l'accueil de l'agence, le relevé du
 * bailleur et l'accueil du locataire. L'*Impayé* ne change pas.
 *
 * Avant : un loyer de 100 000 `paid` dont 5 000 de pénalité restent dus n'était compté nulle part.
 */
class PenalitesARecouvrerTest extends ApiTestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function line(Lease $lease, array $attributes): LeasePayment
    {
        return LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-10 10:00:00',
            'due_date' => '2026-09-05',
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
        ], $attributes));
    }

    /** Un loyer payé à pénalité due, une pénalité réglée, une échéance annulée à pénalité, une caution rendue à pénalité. */
    private function seedLines(Lease $lease, ?Customer $payer = null): void
    {
        $payer = $payer?->id ?? Customer::factory()->create()->id;
        $this->line($lease, ['payer_id' => $payer, 'late_fee_amount' => 5_000, 'late_fee_applied_at' => '2026-09-08 00:00:00']);
        $this->line($lease, ['payer_id' => $payer, 'late_fee_amount' => 3_000, 'late_fee_applied_at' => '2026-09-08 00:00:00', 'late_fee_paid_at' => '2026-09-12 10:00:00']);
        $this->line($lease, ['payer_id' => $payer, 'status' => PaymentStatus::Cancelled, 'paid_at' => null, 'late_fee_amount' => 2_000]);
        $this->line($lease, ['payer_id' => $payer, 'payment_type' => LeasePaymentType::DepositRefund, 'late_fee_amount' => 1_000]);
    }

    public function test_agency_home_renders_late_fees_to_collect_apart_from_overdue(): void
    {
        Carbon::setTestNow('2026-09-20 10:00:00');
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->seedLines(Lease::factory()->active()->create(['agency_id' => $agency->id]));

        $finance = $this->apiGet('/api/dashboard/agency')->assertOk()->json('data.finance');

        $this->assertSame(1, $finance['late_fees_outstanding_count']);
        $this->assertEquals(5_000, $finance['late_fees_outstanding_amount']);
        // L'Impayé ne change pas : le loyer est payé.
        $this->assertSame(0, $finance['overdue_count']);
    }

    public function test_owner_statement_renders_late_fees_to_collect_of_the_period(): void
    {
        Carbon::setTestNow('2026-10-02 10:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->seedLines($this->leaseOf($agency, $landlord, 10));
        Sanctum::actingAs($landlord);

        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');

        $this->assertSame(['count' => 1, 'amount' => 5000], array_map('intval', $data['late_fees_outstanding']));
        $this->assertSame(0, $data['unpaid']['count']);
        $this->getJson('/api/owner-statements?period=2026-08')->assertOk()->assertJsonPath('data.late_fees_outstanding.count', 0);
        $this->get('/api/owner-statements/pdf?period=2026-09')->assertOk();
        // La ligne du PDF : la vue rendue avec le relevé du mois.
        $html = view('pdf.statements.owner', ['title' => 'Relevé', 'document_label' => 'Relevé', 'agency' => $agency, 'statement' => $data])->render();
        $this->assertStringContainsString('Late fees to collect : 1', $html);
    }

    public function test_tenant_home_renders_late_fees_to_collect(): void
    {
        Carbon::setTestNow('2026-09-20 10:00:00');
        $user = $this->apiActingAsRole('customer');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $this->seedLines(Lease::factory()->active()->create(['tenant_id' => $customer->id]), $customer);

        $payments = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data.payments');

        $this->assertSame(1, $payments['late_fees_outstanding_count']);
        $this->assertEquals(5_000, $payments['late_fees_outstanding_amount']);
        $this->assertSame(0, $payments['overdue_count']);
    }
}
