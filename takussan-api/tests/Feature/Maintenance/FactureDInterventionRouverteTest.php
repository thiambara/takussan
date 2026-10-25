<?php

namespace Tests\Feature\Maintenance;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Payout\PayoutCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-2270 (P224.01 à P224.04, ADR-0039 § 8, amendement du 2026-10-25) — la facture d'une
 * intervention contestée ou annulée.
 *
 * La contestation et l'annulation passent la facture `pending_validation`, ou `validated` sans
 * reversement vivant et non imputée, à `cancelled` ; une facture payée, imputée ou en cours de
 * paiement reste, et l'agence en est avisée. Rien ne valide, ne paie ni n'impute une facture dont
 * l'intervention n'est ni `completed` ni `closed`.
 */
class FactureDInterventionRouverteTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EnvoisParCode;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private Lease $lease;

    private User $admin;

    private User $providerA;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        $this->lease = $this->leaseOf($this->agency, $this->landlord, 0);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->providerA = $this->provider();
    }

    private function provider(): User
    {
        $provider = User::factory()->create();
        $profile = ServiceProviderProfile::factory()->create(['user_id' => $provider->id]);
        $profile->agencies()->attach($this->agency->id, [
            'status' => 'active',
            'started_at' => now()->toDateString(),
            'agency_role_id' => DB::table('agency_roles')->where('agency_id', $this->agency->id)
                ->where('is_system', true)->where('base_profile_type', 'service_provider')->value('id'),
        ]);

        return $provider;
    }

    /** Une intervention `in_progress` chez A, au devis approuvé de 50 000, sur le bien du bailleur. */
    private function intervention(): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => $this->lease->property_id,
            'requester_id' => $this->landlord->id,
            'assigned_to' => $this->providerA->id,
            'status' => MaintenanceStatus::InProgress,
            'quote_amount' => 50_000,
            'quote_decision_at' => now(),
            'quote_rejection_reason' => null,
        ]);
    }

    private function service(): MaintenanceRequestService
    {
        return app(MaintenanceRequestService::class);
    }

    private function contest(MaintenanceRequest $mr): void
    {
        $this->service()->contestResolution($mr, $this->landlord, 'Toujours une fuite');
    }

    private function billOf(MaintenanceRequest $mr): ServiceProviderBill
    {
        return ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)->orderBy('id')->firstOrFail();
    }

    private function rechargeable(): int
    {
        return app(PayoutCalculator::class)->rechargeableBills((int) $this->agency->id, (int) $this->landlord->id)->count();
    }

    private function avisRecus(User $user): int
    {
        return self::nombreDEnvois($user, NotificationCode::ServiceProviderBillKeptOnReopen);
    }

    public function test_p224_01_contestation_puis_annulation_annulent_la_facture_en_attente(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $this->assertSame(ServiceProviderBillStatus::PendingValidation, $bill->status);

        $this->contest($mr);
        $this->assertSame(ServiceProviderBillStatus::Cancelled, $bill->fresh()->status);

        $this->service()->transition($mr->fresh(), MaintenanceStatus::Cancelled, $this->admin);
        $this->assertSame(ServiceProviderBillStatus::Cancelled, $bill->fresh()->status);

        $this->actingWithStepUp($this->admin);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertStatus(422);
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay")->assertStatus(422);
        $this->assertSame(0, $this->rechargeable());
        $this->assertSame(0, $this->avisRecus($this->admin));
    }

    public function test_p224_01_une_facture_validee_sans_reversement_ni_imputation_est_annulee(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $this->actingWithStepUp($this->admin);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();

        $this->contest($mr);

        $this->assertSame(ServiceProviderBillStatus::Cancelled, $bill->fresh()->status);
        $this->assertSame(0, $this->rechargeable());
        $this->assertSame(0, $this->avisRecus($this->admin));
    }

    public function test_p224_01_une_facture_payee_reste_et_l_agence_est_avisee(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $bill->forceFill(['status' => ServiceProviderBillStatus::Paid, 'validated_at' => now()])->save();

        $this->contest($mr);

        $this->assertSame(ServiceProviderBillStatus::Paid, $bill->fresh()->status);
        $avis = Notification::sent($this->admin, CodedNotification::class, self::deCode(NotificationCode::ServiceProviderBillKeptOnReopen));
        $this->assertCount(1, $avis);
        $this->assertSame($bill->reference_number, $avis->first()->params['reference']);
        $this->assertSame((string) $mr->title, $avis->first()->params['request']);
        $this->assertSame('service_provider_bills', $avis->first()->target['kind'] ?? null);
        $this->assertSame(0, $this->avisRecus($this->providerA));
        $this->assertSame(0, $this->avisRecus($this->landlord));
        // Payée et restée : elle ne se refacture pas tant que le travail n'est pas rendu.
        $this->assertSame(0, $this->rechargeable());

        // L'annulation est un second événement : un second avis.
        $this->service()->transition($mr->fresh(), MaintenanceStatus::Cancelled, $this->admin);
        $this->assertSame(ServiceProviderBillStatus::Paid, $bill->fresh()->status);
        $this->assertSame(2, $this->avisRecus($this->admin));
    }

    public function test_p224_01_une_facture_imputee_au_bailleur_reste_et_l_agence_est_avisee(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $rent = $this->leasePayment($this->lease, 200_000);
        $this->actingWithStepUp($this->admin);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();
        $this->postJson('/api/payouts', [
            'landlord_id' => $this->landlord->id,
            'lease_payment_ids' => [$rent->id],
            'service_provider_bill_ids' => [$bill->id],
        ])->assertCreated()->assertJsonPath('data.fees_amount', 50000);
        $this->assertNotNull($bill->fresh()->imputed_payout_id);

        $this->contest($mr);

        $this->assertSame(ServiceProviderBillStatus::Validated, $bill->fresh()->status);
        $this->assertNotNull($bill->fresh()->imputed_payout_id);
        $this->assertSame(1, $this->avisRecus($this->admin));
    }

    /** Hypothèse du ticket : un reversement vivant au prestataire, c'est un paiement en cours. */
    public function test_p224_01_une_facture_validee_en_cours_de_paiement_reste_et_l_agence_est_avisee(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $this->actingWithStepUp($this->admin);
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay", ['payment_method' => 'cash'])->assertCreated();

        $this->contest($mr);

        $this->assertSame(ServiceProviderBillStatus::Validated, $bill->fresh()->status);
        $this->assertSame(1, $this->avisRecus($this->admin));
    }

    /**
     * La garde seule, sans l'observateur : une intervention repartie `in_progress` par une écriture
     * qui ne passe pas par Eloquent. Chaque refus a son versant « travail rendu → accepté ».
     */
    public function test_p224_01_la_garde_refuse_valider_payer_et_imputer_hors_travail_rendu(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $bill = $this->billOf($mr);
        $rent = $this->leasePayment($this->lease, 200_000);
        $reopen = fn () => DB::table('maintenance_requests')->where('id', $mr->id)->update(['status' => MaintenanceStatus::InProgress->value]);
        $finish = fn () => DB::table('maintenance_requests')->where('id', $mr->id)->update(['status' => MaintenanceStatus::Completed->value]);
        $this->actingWithStepUp($this->admin);

        $reopen();
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.request_not_completed');
        $this->assertSame(ServiceProviderBillStatus::PendingValidation, $bill->fresh()->status);
        $finish();
        $this->postJson("/api/service-provider-bills/{$bill->id}/validate")->assertOk();

        $reopen();
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay", ['payment_method' => 'cash'])->assertStatus(422)
            ->assertJsonPath('code', 'service_provider_bill.request_not_completed');
        $this->assertSame(0, $this->rechargeable());
        $this->postJson('/api/payouts', [
            'landlord_id' => $this->landlord->id,
            'lease_payment_ids' => [$rent->id],
            'service_provider_bill_ids' => [$bill->id],
        ])->assertStatus(422)->assertJsonValidationErrors('service_provider_bill_ids');
        $this->assertNull($bill->fresh()->imputed_payout_id);

        DB::table('maintenance_requests')->where('id', $mr->id)->update(['status' => MaintenanceStatus::Closed->value]);
        $this->assertSame(1, $this->rechargeable());
        $this->postJson("/api/service-provider-bills/{$bill->id}/pay", ['payment_method' => 'cash'])->assertCreated();
    }

    public function test_p224_02_reassigner_apres_contestation_facture_le_second_prestataire(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $billA = $this->billOf($mr);
        $this->contest($mr);
        $providerB = $this->provider();

        $this->service()->assign($mr->fresh(), $providerB, $this->admin);
        $mr->refresh()->forceFill([
            'status' => MaintenanceStatus::InProgress,
            'quote_amount' => 70_000,
            'quote_decision_at' => now(),
        ])->save();
        $this->service()->complete($mr, ['actual_cost' => 70_000]);

        $this->assertSame(ServiceProviderBillStatus::Cancelled, $billA->fresh()->status);
        $open = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)
            ->where('status', ServiceProviderBillStatus::PendingValidation)->sole();
        $this->assertSame($providerB->id, (int) $open->provider_id);
        $this->assertEquals(70000, (float) $open->amount);
    }

    public function test_p224_03_une_seconde_fin_des_travaux_a_un_autre_cout_refait_la_facture(): void
    {
        $mr = $this->intervention();
        $this->service()->complete($mr, []);
        $first = $this->billOf($mr);
        $this->contest($mr);

        $this->service()->complete($mr->fresh(), ['actual_cost' => 80_000]);

        $this->assertSame(ServiceProviderBillStatus::Cancelled, $first->fresh()->status);
        $open = ServiceProviderBill::query()->where('maintenance_request_id', $mr->id)
            ->where('status', ServiceProviderBillStatus::PendingValidation)->sole();
        $this->assertEquals(80000, (float) $open->amount);
        $this->assertTrue($open->exceeds_quote);
    }
}
