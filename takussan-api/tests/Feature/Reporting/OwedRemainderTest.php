<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payout\OwnerStatementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 (verif-595 passe 2, MAJEUR 1) — une échéance `partially_paid` est un dû : *Impayé* la compte,
 * au RESTE DÛ (`amount − metadata.paid_amount`, l'assiette de `LateFeeCalculator`), et chaque lecteur
 * rend le même chiffre que le relevé du bailleur.
 *
 * Jeu calculé à la main, mesuré le 2026-07-01 (toutes les échéances de juin sont échues) :
 *
 * | # | statut          | montant | versé  | reste dû | échéance   |
 * |---|-----------------|---------|--------|----------|------------|
 * | 1 | pending         | 100 000 |      0 |  100 000 | 2026-06-05 |
 * | 2 | partially_paid  | 100 000 | 40 000 |   60 000 | 2026-06-10 |
 * | 3 | late            | 100 000 |      0 |  100 000 | 2026-06-20 |
 * | 4 | partially_paid  |  60 000 | 20 000 |   40 000 | 2026-06-25 |
 *
 * Attendu partout : 4 échéances, 300 000. Ne comptent pas : une échéance payée, une échéance annulée
 * (TCK-596), et une échéance de juillet non échue.
 */
class OwedRemainderTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private User $tenantUser;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-01 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = $this->apiActingAsRole('owner', ['agency' => $this->agency]);
        $this->tenantUser = User::factory()->create();

        $property = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->tenantUser->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);

        $this->rent($lease, PaymentStatus::Pending, 100_000, '2026-06-05');
        $this->rent($lease, PaymentStatus::PartiallyPaid, 100_000, '2026-06-10', 40_000);
        $this->rent($lease, PaymentStatus::Late, 100_000, '2026-06-20');
        $this->rent($lease, PaymentStatus::PartiallyPaid, 60_000, '2026-06-25', 20_000);

        $this->rent($lease, PaymentStatus::Paid, 100_000, '2026-06-01');
        $this->rent($lease, PaymentStatus::Cancelled, 100_000, '2026-06-15');
        $this->rent($lease, PaymentStatus::Pending, 100_000, '2026-07-05');
    }

    private function rent(Lease $lease, PaymentStatus $status, float $amount, string $due, ?float $paid = null): void
    {
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => $status,
            'amount' => $amount,
            'due_date' => $due,
            'paid_at' => $status === PaymentStatus::Paid ? $due : null,
            'metadata' => $paid !== null ? ['paid_amount' => $paid] : null,
        ]);
    }

    public function test_every_reader_counts_the_partially_paid_remainder_like_the_landlord_statement(): void
    {
        $statement = app(OwnerStatementService::class)->statement($this->agency, $this->landlord, '2026-06')['unpaid'];
        $this->assertSame(4, $statement['count']);
        $this->assertEquals(300000.0, $statement['amount']);

        $this->actingAsApi($this->admin);
        $agency = $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance');
        $this->assertSame(4, $agency['overdue_count']);
        $this->assertEquals(300000.0, $agency['overdue_amount']);

        $aging = $this->getJson("/api/agencies/{$this->agency->id}/finance/aging")->assertOk()->json('data');
        $this->assertSame(4, $aging['total']['count']);
        $this->assertEquals(300000.0, $aging['total']['amount']);
        $this->assertSame(['count' => 4, 'amount' => 300000], $aging['buckets']['1_30']);

        $csv = $this->getJson('/api/export/aging?format=csv')->assertOk()->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));
        $header = str_getcsv(array_shift($lines));
        $amounts = array_map(fn (string $line) => (float) str_getcsv($line)[array_search('amount', $header, true)], $lines);
        $this->assertCount(4, $amounts);
        $this->assertEquals(300000.0, array_sum($amounts));

        $this->actingAsApi($this->landlord);
        $owner = $this->getJson('/api/dashboard/owner')->assertOk()->json('data.finance');
        $this->assertSame(4, $owner['overdue_count']);
        $this->assertEquals(300000.0, $owner['overdue_amount']);

        $this->actingAsApi($this->tenantUser);
        $tenant = $this->getJson('/api/dashboard/tenant')->assertOk()->json('data.payments');
        $this->assertSame(4, $tenant['overdue_count']);
        $this->assertEquals(300000.0, $tenant['overdue_amount']);
    }
}
