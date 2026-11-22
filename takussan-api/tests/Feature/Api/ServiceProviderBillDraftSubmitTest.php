<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Payout\PayoutCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2911 (ADR-0120 § 1) — la facture naît `draft` à la clôture (« À facturer »), n'est lue que de son
 * prestataire, et part par « Facturer » (`POST …/submit`) : lui seul, depuis `draft` seulement. Un
 * brouillon n'entre ni dans les sorties d'argent ni dans le relevé du bailleur (AC4).
 */
class ServiceProviderBillDraftSubmitTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

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

    /** Une intervention en cours au devis approuvé de 50 000, terminée : sa facture naît. */
    private function completed(Agency $agency, User $provider, ?User $landlord = null): MaintenanceRequest
    {
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord?->id ?? User::factory()])->id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::InProgress,
            'quote_amount' => 50_000,
            'quote_decision_at' => now(),
            'quote_rejection_reason' => null,
            'actual_cost' => null,
        ]);
        $mr->update(['status' => MaintenanceStatus::Completed]);

        return $mr;
    }

    public function test_ac3_la_facture_nait_brouillon_et_le_prestataire_la_lit_a_facturer(): void
    {
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $mr = $this->completed($agency, $provider);

        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertSame(ServiceProviderBillStatus::Draft, $bill->status);
        $this->assertNull($bill->submitted_at);

        Sanctum::actingAs($provider);
        $this->getJson('/api/service-provider-bills?filter[status]=draft')->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $bill->id)
            ->assertJsonPath('data.0.status', 'draft');
        $this->getJson('/api/service-provider-bills?filter[status]=pending_validation')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_ac3_le_brouillon_n_est_pas_une_piece_recue_de_l_agence(): void
    {
        $agency = $this->moneyAgency();
        $mr = $this->completed($agency, $this->provider($agency));
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();

        $this->actingWithStepUp($this->agencyAdmin($agency));
        $this->getJson('/api/service-provider-bills')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson("/api/service-provider-bills/{$bill->id}")->assertNotFound();
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.not_pending');
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay")->assertStatus(422);
        $this->assertSame(ServiceProviderBillStatus::Draft, $bill->fresh()->status);
    }

    public function test_ac3_facturer_par_le_prestataire_envoie_le_montant_final_et_sa_piece(): void
    {
        Storage::fake(config('media-library.disk_name'));
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $mr = $this->completed($agency, $provider);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();

        Sanctum::actingAs($provider);
        $this->post("/api/service-provider-bills/{$bill->id}/submit", [
            'amount' => '55000.4',
            'provider_reference' => 'FAC-2026-118',
            'file' => UploadedFile::fake()->create('facture.pdf', 40, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_validation')
            ->assertJsonPath('data.amount', 55000)
            ->assertJsonPath('data.exceeds_quote', true)
            ->assertJsonPath('data.provider_reference', 'FAC-2026-118')
            ->assertJsonPath('data.invoice.name', 'facture.pdf');

        $fresh = $bill->fresh();
        $this->assertSame(ServiceProviderBillStatus::PendingValidation, $fresh->status);
        $this->assertNotNull($fresh->submitted_at);
        $this->assertCount(1, $fresh->getMedia('invoice'));

        // Une seconde fois : la facture est partie.
        $this->postJson("/api/service-provider-bills/{$bill->id}/submit")->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.not_draft');

        // L'agence la lit désormais, et la valide.
        $this->actingWithStepUp($this->agencyAdmin($agency));
        $this->getJson('/api/service-provider-bills')->assertOk()->assertJsonPath('meta.total', 1);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk()->assertJsonPath('data.status', 'validated');
    }

    public function test_ac3_sans_corps_le_montant_du_brouillon_part_tel_quel(): void
    {
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $this->completed($agency, $provider)->id)->sole();

        Sanctum::actingAs($provider);
        $this->postJson("/api/service-provider-bills/{$bill->id}/submit")->assertOk()
            ->assertJsonPath('data.amount', 50000)
            ->assertJsonPath('data.exceeds_quote', false);
    }

    public function test_ac3_un_autre_prestataire_et_le_personnel_recoivent_403(): void
    {
        $agency = $this->moneyAgency();
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $this->completed($agency, $this->provider($agency))->id)->sole();

        foreach (['autre prestataire' => $this->provider($agency), 'admin de l’agence' => $this->agencyAdmin($agency)] as $qui => $intrus) {
            $this->actingWithStepUp($intrus);
            $this->postJson("/api/service-provider-bills/{$bill->id}/submit", ['amount' => 1])->assertForbidden();
            $this->assertSame(ServiceProviderBillStatus::Draft, $bill->fresh()->status, $qui);
        }
    }

    /** La contestation annule le brouillon (jamais engagé) ; « Facturer » n'est plus possible. */
    public function test_la_contestation_annule_le_brouillon(): void
    {
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $mr = $this->completed($agency, $provider);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();

        app(MaintenanceRequestService::class)->contestResolution($mr->fresh(), $this->agencyAdmin($agency), 'Toujours une fuite');

        $this->assertSame(ServiceProviderBillStatus::Cancelled, $bill->fresh()->status);
        Sanctum::actingAs($provider);
        $this->postJson("/api/service-provider-bills/{$bill->id}/submit")->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.not_draft');
    }

    /**
     * Le travail se rejuge sous le verrou : un brouillon resté ouvert sur une intervention qui n'est
     * plus rendue (état écrit hors de l'observateur) ne part pas.
     */
    public function test_facturer_exige_un_travail_encore_rendu(): void
    {
        $agency = $this->moneyAgency();
        $provider = $this->provider($agency);
        $mr = $this->completed($agency, $provider);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();
        MaintenanceRequest::query()->whereKey($mr->id)->toBase()->update(['status' => MaintenanceStatus::InProgress->value]);

        Sanctum::actingAs($provider);
        $this->postJson("/api/service-provider-bills/{$bill->id}/submit")->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.request_not_completed');
        $this->assertSame(ServiceProviderBillStatus::Draft, $bill->fresh()->status);
    }

    /**
     * AC4 — un brouillon refacturable n'est ni imputable au bailleur, ni cité par un reversement, ni
     * dans le relevé du mois ; envoyé puis validé, il l'est.
     */
    public function test_ac4_un_brouillon_n_entre_ni_dans_les_sorties_d_argent_ni_dans_le_releve_du_bailleur(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $provider = $this->provider($agency);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $lease->property_id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::InProgress,
            'quote_amount' => 15_000,
            'quote_decision_at' => now(),
            'quote_rejection_reason' => null,
        ]);
        $mr->update(['status' => MaintenanceStatus::Completed]);
        $bill = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertTrue($bill->rechargeable_to_landlord);
        $this->assertSame(ServiceProviderBillStatus::Draft, $bill->status);

        $calculator = app(PayoutCalculator::class);
        $this->assertSame(0, $calculator->rechargeableBills((int) $agency->id, (int) $landlord->id)->count());

        [$rent] = $this->septemberOf($lease);
        Sanctum::actingAs($this->agencyAgent($agency));
        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'service_provider_bill_ids' => [$bill->id],
        ])->assertStatus(422);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');
        Payout::query()->whereKey($id)->update(['status' => 'completed', 'processed_at' => '2026-09-30 09:00:00']);

        Sanctum::actingAs($landlord);
        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');
        $this->assertSame(0, (int) $data['totals']['fees']);
        $this->assertSame([], $data['lines']['service_provider_bills'] ?? []);

        // Versant autorisé : envoyé puis validé, il devient imputable.
        $bill->forceFill(['status' => ServiceProviderBillStatus::Validated])->save();
        $this->assertSame(1, $calculator->rechargeableBills((int) $agency->id, (int) $landlord->id)->count());
    }
}
