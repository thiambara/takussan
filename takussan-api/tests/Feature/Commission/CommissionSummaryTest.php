<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2661 — le point des commissions par bénéficiaire : dû, payé sur le mois et l'année, dernier
 * paiement. L'admin lit son agence, l'agent sa seule entrée.
 */
class CommissionSummaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $colleague;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 15:00:00', 'Africa/Dakar'));

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->colleague = $this->agencyAgent($this->agency);

        // L'agent : deux lignes dues, une payée en novembre (wave), une en mars (cash), une annulée.
        $this->line($this->agent, 10_000, '2026-09-01 09:00');
        $this->line($this->agent, 20_000, '2026-10-01 09:00');
        $this->line($this->agent, 40_000, '2026-08-01 09:00', CommissionEntryStatus::Paid, '2026-11-03 10:00', PaymentMethod::Wave);
        $this->line($this->agent, 80_000, '2026-02-01 09:00', CommissionEntryStatus::Paid, '2026-03-03 10:00', PaymentMethod::Cash);
        $this->line($this->agent, 999_000, '2026-07-01 09:00', CommissionEntryStatus::Cancelled);
        // Un collègue de la même agence, et un agent d'une autre agence.
        $this->line($this->colleague, 5_000, '2026-10-15 09:00');
        $other = Agency::factory()->create();
        $this->line($this->agencyAgent($other), 7_000, '2026-10-15 09:00', agency: $other);
    }

    private function line(User $beneficiary, float $amount, string $earnedAt, CommissionEntryStatus $status = CommissionEntryStatus::Due, ?string $paidAt = null, ?PaymentMethod $method = null, ?Agency $agency = null): CommissionEntry
    {
        $agency ??= $this->agency;

        return CommissionEntry::factory()->create([
            'agency_id' => $agency->id,
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'beneficiary_id' => $beneficiary->id,
            'amount' => $amount,
            'status' => $status,
            'earned_at' => Carbon::parse($earnedAt, 'Africa/Dakar'),
            'paid_at' => $paidAt !== null ? Carbon::parse($paidAt, 'Africa/Dakar') : null,
            'payment_method' => $method,
        ]);
    }

    public function test_ac5_an_agent_reads_a_single_entry_his_own(): void
    {
        $rows = $this->actingAsApi($this->agent)->getJson('/api/commissions/summary')->assertOk()->json('data');

        $this->assertCount(1, $rows);
        $this->assertSame($this->agent->id, $rows[0]['beneficiary']['id']);
    }

    public function test_the_admin_reads_every_beneficiary_of_his_agency_most_owed_first(): void
    {
        $rows = $this->actingAsApi($this->admin)->getJson('/api/commissions/summary')->assertOk()->json('data');

        $this->assertSame([$this->agent->id, $this->colleague->id], array_column(array_column($rows, 'beneficiary'), 'id'));
    }

    public function test_the_figures_of_a_beneficiary(): void
    {
        $response = $this->actingAsApi($this->agent)->getJson('/api/commissions/summary?month=2026-11&year=2026')->assertOk();
        $row = $response->json('data.0');

        $this->assertEquals(30_000, $row['due_amount']);
        $this->assertSame(2, $row['due_count']);
        $this->assertSame('2026-09-01T09:00:00+00:00', $row['oldest_due_earned_at']);
        $this->assertEquals(40_000, $row['paid_month']);
        $this->assertEquals(120_000, $row['paid_year']);
        $this->assertSame(['at' => '2026-11-03T10:00:00+00:00', 'method' => 'wave'], $row['last_paid']);
        $this->assertSame(['month' => '2026-11', 'year' => '2026'], $response->json('meta'));

        // Le mois de mars : le paiement en espèces.
        $this->assertEquals(80_000, $this->getJson('/api/commissions/summary?month=2026-03')->json('data.0.paid_month'));
        // L'année précédente : rien de payé.
        $this->assertEquals(0, $this->getJson('/api/commissions/summary?year=2025')->json('data.0.paid_year'));
    }

    public function test_a_landlord_has_no_summary_even_with_an_invalid_query(): void
    {
        $landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($landlord)->getJson('/api/commissions/summary')->assertForbidden();
        $this->actingAsApi($landlord)->getJson('/api/commissions/summary?month=nope')->assertForbidden();
    }

    public function test_the_period_is_validated(): void
    {
        $this->actingAsApi($this->admin);

        $this->getJson('/api/commissions/summary?month=2026-13')->assertStatus(422)->assertJsonValidationErrors('month');
        $this->getJson('/api/commissions/summary?month[]=2026-11')->assertStatus(422)->assertJsonValidationErrors('month');
        $this->getJson('/api/commissions/summary?year=26')->assertStatus(422)->assertJsonValidationErrors('year');
    }
}
