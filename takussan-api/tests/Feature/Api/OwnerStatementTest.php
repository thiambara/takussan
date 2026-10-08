<?php

namespace Tests\Feature\Api;

use App\Models\Enums\Capability;
use App\Models\Enums\LeasePaymentType;
use App\Models\Payout;
use App\Models\ServiceProviderBill;
use App\Notifications\Payouts\OwnerStatementAvailableNotification;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC5) — le relevé de gérance : ce qui a été encaissé, retenu et reversé, pour un mois ou
 * une année, lu par le bailleur et par le personnel de son agence qui détient `payouts.create`.
 */
class OwnerStatementTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** Le jeu d'AC1 reversé avec une facture d'intervention refacturable de 15 000. */
    private function paidOutSeptember(): array
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        [$rent, $charges] = $this->septemberOf($lease);
        $bill = ServiceProviderBill::factory()->validated()->create([
            'agency_id' => $agency->id, 'property_id' => $lease->property_id, 'amount' => 15_000,
        ]);
        Sanctum::actingAs($this->agencyAgent($agency));
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id, $charges->id],
            'service_provider_bill_ids' => [$bill->id],
        ])->assertCreated()->assertJsonPath('data.net_amount', 183000)->json('data.id');

        return [$agency, $landlord, Payout::findOrFail($id), $lease];
    }

    public function test_ac5_september_collected_commission_fees_net_and_the_payout_reference(): void
    {
        [, $landlord, $payout] = $this->paidOutSeptember();
        Sanctum::actingAs($landlord);

        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');

        $this->assertSame([220000, 22000, 15000, 183000], array_map('intval', [
            $data['totals']['gross'], $data['totals']['commission'], $data['totals']['fees'], $data['totals']['net'],
        ]));
        $this->assertSame([$payout->reference_number], array_column($data['payouts'], 'reference_number'));
        $this->assertCount(1, $data['properties']);
        // Le loyer `pending` de septembre est un impayé de la période.
        $this->assertSame(1, $data['unpaid']['count']);

        $this->get('/api/owner-statements/pdf?period=2026-09')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $csv = $this->get('/api/owner-statements/csv?period=2026-09')->assertOk()->streamedContent();
        $this->assertStringContainsString($payout->reference_number, $csv);
    }

    public function test_ac5_another_landlord_and_an_agent_without_payouts_create_get_403(): void
    {
        [$agency, $landlord] = $this->paidOutSeptember();
        $query = "/api/owner-statements?period=2026-09&landlord_id={$landlord->id}&agency_id={$agency->id}";

        Sanctum::actingAs($this->landlordOf($agency));
        $this->getJson($query)->assertForbidden();

        Sanctum::actingAs($this->agentWithout($agency, Capability::PayoutsCreate));
        $this->getJson($query)->assertForbidden();

        Sanctum::actingAs($this->agencyAgent($this->moneyAgency()));
        $this->getJson($query)->assertForbidden();

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->getJson($query)->assertOk()->assertJsonPath('data.totals.net', 183000);
    }

    public function test_ac5_the_year_sums_the_months_and_a_deposit_refund_is_not_a_payout_of_the_landlord(): void
    {
        [, $landlord, , $lease] = $this->paidOutSeptember();
        $october = $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, '2026-10-10 10:00:00');
        // Un `Payout` locataire (caution rendue) qui porterait une pièce de la période — une donnée
        // d'avant la reprise : le relevé du bailleur ne le lit pas.
        Payout::factory()->create([
            'agency_id' => $lease->agency_id, 'landlord_id' => $landlord->id, 'payee_role' => 'tenant', 'net_amount' => 400_000,
        ])->leasePayments()->attach($october->id);
        Sanctum::actingAs($landlord);

        $year = $this->getJson('/api/owner-statements?period=2026')->assertOk()->json('data');

        $this->assertTrue($year['annual']);
        $this->assertSame(420000, (int) $year['totals']['gross']);
        $this->assertSame(1, count($year['payouts']));
        $this->getJson('/api/owner-statements?period=2026-13')->assertStatus(422);
    }

    public function test_the_monthly_command_notifies_each_landlord_once_and_is_scheduled(): void
    {
        Notification::fake();
        [, $landlord] = $this->paidOutSeptember();

        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();

        Notification::assertSentToTimes($landlord, OwnerStatementAvailableNotification::class, 1);

        $events = array_values(array_filter(
            app(Schedule::class)->events(),
            static fn (Event $e): bool => str_contains((string) $e->command, 'payouts:send-owner-statements'),
        ));
        $this->assertCount(1, $events);
        $this->assertSame('0 8 1 * *', $events[0]->expression);
        $this->assertSame('Africa/Dakar', $events[0]->timezone);
    }
}
