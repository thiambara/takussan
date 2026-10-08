<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC15) — l'intervention terminée produit sa facture ; la facture validée se paie par un
 * reversement au prestataire, soumis aux quatre yeux d'agence.
 */
class ServiceProviderBillTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function provider(Agency $agency): User
    {
        $provider = User::factory()->create();
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $provider->id]);
        $profile->agencies()->attach($agency->id, [
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'agency_role_id' => DB::table('agency_roles')->where('agency_id', $agency->id)
                ->where('is_system', true)->where('base_profile_type', 'service_provider')->value('id'),
        ]);

        return $provider;
    }

    private function request(Agency $agency, ?User $provider, array $attributes = []): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create(array_merge([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'assigned_to' => $provider?->id,
            'status' => MaintenanceStatus::InProgress,
            'quote_amount' => 50_000,
            'quote_decision_at' => now(),
            'quote_rejection_reason' => null,
            'actual_cost' => null,
        ], $attributes));
    }

    public function test_ac15_completion_creates_one_bill_at_the_approved_quote(): void
    {
        $agency = $this->moneyAgency();
        $request = $this->request($agency, $this->provider($agency));

        $request->update(['status' => MaintenanceStatus::Completed]);
        $request->update(['status' => MaintenanceStatus::InProgress]);
        $request->update(['status' => MaintenanceStatus::Completed]);

        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $request->id)->sole();
        $this->assertEquals(50000, (float) $bill->amount);
        $this->assertSame('pending_validation', $bill->status->value);
        $this->assertFalse($bill->exceeds_quote);
        $this->assertSame($agency->id, $bill->agency_id);
    }

    public function test_ac15_the_actual_cost_wins_and_flags_the_overrun(): void
    {
        $agency = $this->moneyAgency();
        $request = $this->request($agency, $this->provider($agency), ['actual_cost' => 60_000]);

        $request->update(['status' => MaintenanceStatus::Completed]);

        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $request->id)->sole();
        $this->assertEquals(60000, (float) $bill->amount);
        $this->assertTrue($bill->exceeds_quote);
    }

    public function test_ac15_no_provider_or_a_rejected_quote_creates_no_bill(): void
    {
        $agency = $this->moneyAgency();
        $this->request($agency, null)->update(['status' => MaintenanceStatus::Completed]);
        $this->request($agency, $this->provider($agency), ['quote_rejection_reason' => 'Trop cher'])
            ->update(['status' => MaintenanceStatus::Completed]);

        $this->assertSame(0, ServiceProviderBill::query()->count());
    }

    public function test_ac15_a_validated_bill_is_paid_through_the_four_eyes(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 40_000])->save();
        $provider = $this->provider($agency);
        $request = $this->request($agency, $provider);
        $request->update(['status' => MaintenanceStatus::Completed]);
        $bill = ServiceProviderBill::query()->sole();
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);

        $this->actingWithStepUp($issuer);
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay")->assertStatus(422);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk()->assertJsonPath('data.status', 'validated');
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertStatus(422);

        $payoutId = $this->postJson("/api/service-provider-bills/{$bill->id}/pay")->assertCreated()
            ->assertJsonPath('data.payee_role', 'service_provider')
            ->assertJsonPath('data.status', 'awaiting_approval')
            ->assertJsonPath('data.net_amount', 50000)
            ->json('data.id');
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay")->assertStatus(409);

        $this->postJson("/api/payouts/{$payoutId}/approve")->assertForbidden();
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$payoutId}/approve")->assertOk();
        $this->actingWithStepUp($issuer);
        $this->postJson("/api/payouts/{$payoutId}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-5'])
            ->assertOk();

        $this->assertSame(PayoutStatus::Completed, Payout::find($payoutId)->status);
        $this->assertSame('paid', $bill->fresh()->status->value);
        $this->assertSame($provider->id, Payout::find($payoutId)->landlord_id);
    }

    public function test_ac15_the_provider_reads_its_bills_and_gets_404_on_another(): void
    {
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $this->request($agency, $provider)->update(['status' => MaintenanceStatus::Completed]);
        $this->request($agency, $this->provider($agency))->update(['status' => MaintenanceStatus::Completed]);
        [$mine, $theirs] = ServiceProviderBill::query()->orderBy('id')->get()->all();

        $this->actingWithStepUp($provider);
        $this->getJson('/api/service-provider-bills')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $mine->id);
        $this->getJson("/api/service-provider-bills/{$mine->id}")->assertOk();
        $this->getJson("/api/service-provider-bills/{$theirs->id}")->assertNotFound();

        // Le prestataire ne valide pas sa propre facture.
        $this->postJson("/api/service-provider-bills/{$mine->id}/validate")->assertForbidden();
        // Un agent d'une autre agence ne la lit pas.
        $this->actingWithStepUp($this->agencyAgent($this->moneyAgency()));
        $this->getJson("/api/service-provider-bills/{$mine->id}")->assertNotFound();
    }

    /**
     * VERIF-594 m-3 — un coût réel de 60 000,6 XOF : le prestataire recevait 60 000,6 et le bailleur
     * était débité de 60 001. La facture naît à l'unité de la devise, et le paiement d'une facture
     * antérieure qui garde ses décimales l'arrondit de même : 60 001 des deux côtés.
     */
    public function test_m3_an_xof_bill_is_rounded_to_the_unit_on_both_sides(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $request = $this->request($agency, $this->provider($agency), [
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id])->id,
            'actual_cost' => 60_000.6,
        ]);
        $request->update(['status' => MaintenanceStatus::Completed]);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $request->id)->sole();
        $this->assertEquals(60001, (float) $bill->amount);

        $this->actingWithStepUp($this->agencyAdmin($agency));
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay", ['payment_method' => 'cash'])
            ->assertCreated()->assertJsonPath('data.net_amount', 60001);

        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 200_000);
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id], 'service_provider_bill_ids' => [$bill->id]])
            ->assertCreated()->assertJsonPath('data.fees_amount', 60001)->assertJsonPath('data.net_amount', 139999);

        // Une facture écrite AVANT l'arrondi de l'observateur garde ses décimales : le paiement
        // l'arrondit.
        $legacy = $this->request($agency, $this->provider($agency), ['actual_cost' => 70_000]);
        $legacy->update(['status' => MaintenanceStatus::Completed]);
        $old = ServiceProviderBill::query()->where('maintenance_request_id', $legacy->id)->sole();
        $old->forceFill(['amount' => 70_000.6])->save();
        $this->postJson("/api/service-provider-bills/{$old->id}/validate")->assertOk();
        $this->postJson("/api/service-provider-bills/{$old->id}/pay", ['payment_method' => 'cash'])
            ->assertCreated()->assertJsonPath('data.net_amount', 70001);
    }

    /**
     * VERIF-594 N-1 — l'écran paie une facture sans citer de destination. Au-dessus du seuil, le
     * reversement était approuvé sans destination, puis refusé en Wave
     * (`destination_changed_since_approval`) : le prestataire n'était plus payable qu'en espèces. Il
     * prend désormais la destination par défaut du prestataire vérifiée pour l'agence.
     */
    public function test_n1_a_bill_paid_like_the_screen_goes_to_the_default_verified_destination(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $provider = $this->provider($agency);
        [$issuer, $approver] = [$this->agencyAdmin($agency), $this->agencyAdmin($agency)];
        $destination = PayoutMethod::factory()->verifiedFor($agency, $this->agencyAgent($agency), now()->subDays(3))
            ->create(['user_id' => $provider->id, 'is_default' => true]);
        $request = $this->request($agency, $provider, ['quote_amount' => 150_000]);
        $request->update(['status' => MaintenanceStatus::Completed]);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $request->id)->sole();

        $this->actingWithStepUp($issuer);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();
        $id = $this->postJson("/api/service-provider-bills/{$bill->id}/pay", [])
            ->assertCreated()->assertJsonPath('data.status', 'awaiting_approval')
            ->assertJsonPath('data.payout_method_id', $destination->id)->json('data.id');

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();
        $this->actingWithStepUp($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-N1', 'payout_method_id' => $destination->id])
            ->assertOk()->assertJsonPath('data.status', 'completed');
    }
}
