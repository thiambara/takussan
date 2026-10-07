<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Payout;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

class PayoutTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_agency_user_can_create_payout(): void
    {
        $agency = $this->moneyAgency(['commission_rate' => 10]);
        // TCK-528 — `agency_id` seul matérialise un profil OWNER, qui ne porte pas `payouts.create`.
        $agent = User::factory()->withAgentProfile($agency)->create();
        $landlord = $this->landlordOf($agency);
        // TCK-594 — le brut se lit sur les loyers encaissés : 1 000 000 au taux du bail (10 %).
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 10), 1_000_000);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.gross_amount', 1000000)
            ->assertJsonPath('data.commission_amount', 100000)
            ->assertJsonPath('data.net_amount', 900000);
    }

    public function test_scheduled_payout_gets_scheduled_status(): void
    {
        $agency = $this->moneyAgency();
        // TCK-528 — `agency_id` seul matérialise un profil OWNER, qui ne porte pas `payouts.create`.
        $agent = User::factory()->withAgentProfile($agency)->create();
        $landlord = $this->landlordOf($agency);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord), 500_000);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'scheduled_at' => now()->addDays(5)->toISOString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'scheduled');
    }

    public function test_non_agency_user_cannot_create_payout(): void
    {
        $user = User::factory()->create(['agency_id' => null]);
        $landlord = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [1],
        ])->assertForbidden();
    }

    public function test_agency_user_cannot_create_payout_for_foreign_landlord(): void
    {
        $agency1 = Agency::factory()->create();
        $agency2 = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency1)->create();
        $landlord = User::factory()->create(['agency_id' => $agency2->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [1],
        ])->assertForbidden();
    }

    public function test_negative_net_amount_returns_422(): void
    {
        $agency = $this->moneyAgency();
        // TCK-528 — `agency_id` seul matérialise un profil OWNER, qui ne porte pas `payouts.create`.
        $agent = User::factory()->withAgentProfile($agency)->create();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord);
        $rent = $this->leasePayment($lease, 100_000);
        // TCK-594 — des frais d'intervention qui dépassent le loyer rendraient un net négatif.
        $bill = ServiceProviderBill::factory()->validated()->create([
            'agency_id' => $agency->id,
            'property_id' => $lease->property_id,
            'amount' => 200_000,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'service_provider_bill_ids' => [$bill->id],
        ])->assertStatus(422);

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_landlord_can_view_own_payout(): void
    {
        $landlord = User::factory()->create();
        $payout = Payout::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->getJson("/api/payouts/{$payout->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $payout->id);
    }

    public function test_landlord_cannot_manage_own_payout(): void
    {
        $landlord = User::factory()->create();
        $payout = Payout::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed")
            ->assertForbidden();
    }

    /**
     * TCK-587 (AC2) — le test ci-dessus prend un bailleur SANS agence : il passait déjà avant le
     * ticket, et ne disait rien du cas qui fuyait. Ici le bailleur a un profil ACTIF dans l'agence
     * émettrice — `$user->agency_id === $payout->agency_id` lui ouvrait les trois transitions.
     *
     * @return array<string, array{string, array<string, string>}>
     */
    public static function transitions(): array
    {
        return [
            'mark-processed' => ['mark-processed', ['transaction_id' => 'TX-1', 'payment_method' => 'cash']],
            'mark-failed' => ['mark-failed', ['failed_reason' => 'Banque']],
            'cancel' => ['cancel', []],
        ];
    }

    /** @param  array<string, string>  $body */
    #[DataProvider('transitions')]
    public function test_landlord_of_same_agency_cannot_manage_own_payout(string $transition, array $body): void
    {
        $agency = Agency::factory()->create();
        $landlord = User::factory()->withOwnerProfile($agency)->create();
        $payout = Payout::factory()->create([
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
            'issued_by_id' => $this->agencyAdmin($agency)->id,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/payouts/{$payout->id}/{$transition}", $body)->assertForbidden();
        $this->assertSame('pending', $payout->fresh()->status->value);
    }

    /**
     * ADR-0031 §2 — le bénéficiaire ne gère jamais son propre versement, même personnel : l'hôte
     * d'une agence individuelle, admin et bailleur à la fois, ne marque pas ses versements.
     *
     * @param  array<string, string>  $body
     */
    #[DataProvider('transitions')]
    public function test_a_beneficiary_who_is_also_staff_cannot_manage_own_payout(string $transition, array $body): void
    {
        $agency = Agency::factory()->create();
        $host = $this->agencyAdmin($agency);
        $payout = Payout::factory()->create([
            'landlord_id' => $host->id,
            'agency_id' => $agency->id,
            'issued_by_id' => $host->id,
        ]);

        Sanctum::actingAs($host);

        $this->postJson("/api/payouts/{$payout->id}/{$transition}", $body)->assertForbidden();
    }

    /** @param  array<string, string>  $body */
    #[DataProvider('transitions')]
    public function test_payout_transitions_read_payouts_create(string $transition, array $body): void
    {
        $agency = Agency::factory()->create();
        $payout = Payout::factory()->create([
            'agency_id' => $agency->id,
            'issued_by_id' => $this->agencyAdmin($agency)->id,
        ]);

        Sanctum::actingAs($this->agentWithout($agency, Capability::PayoutsCreate));
        $this->postJson("/api/payouts/{$payout->id}/{$transition}", $body)->assertForbidden();

        Sanctum::actingAs($this->agencyAgent($agency));
        $this->postJson("/api/payouts/{$payout->id}/{$transition}", $body)->assertOk();
    }

    public function test_issuer_can_mark_processed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $payout = Payout::factory()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed", [
            'transaction_id' => 'TX-123',
            'payment_method' => 'check',
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.transaction_id', 'TX-123');
    }

    public function test_cannot_mark_processed_if_completed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $payout = Payout::factory()->completed()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-processed")
            ->assertStatus(422);
    }

    public function test_issuer_can_mark_failed(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $payout = Payout::factory()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/mark-failed", [
            'failed_reason' => 'Bank rejected',
        ])->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.failed_reason', 'Bank rejected');
    }

    public function test_cannot_cancel_completed_payout(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $payout = Payout::factory()->completed()->create([
            'issued_by_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/payouts/{$payout->id}/cancel")
            ->assertStatus(422);
    }

    public function test_list_is_scoped_to_landlord(): void
    {
        $landlord = User::factory()->create();
        Payout::factory()->count(3)->create(['landlord_id' => $landlord->id]);
        Payout::factory()->count(2)->create();

        Sanctum::actingAs($landlord);

        $this->getJson('/api/payouts')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }
}
