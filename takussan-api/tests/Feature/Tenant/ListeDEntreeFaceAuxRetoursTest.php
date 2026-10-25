<?php

namespace Tests\Feature\Tenant;

use App\Console\Commands\RemindTenantOnboarding;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\Setting;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Model\InventoryService;
use App\Services\Model\LeaseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2368 — la liste d'entrée du locataire face aux retours de ce qui l'a cochée.
 *
 *  - P238.01 : un état des lieux d'entrée qui sort de `signed` (contesté) décoche la case, rouvre
 *    la liste et rejoue le rappel J+7, tant qu'aucun autre EDL d'entrée du bail n'est signé.
 *  - P238.02 : un bail renouvelé (`renewed_from_lease_id`) ne reçoit ni liste d'entrée, ni rappel,
 *    ni bienvenue — qu'il naisse `active` ou qu'il attende une signature.
 *  - P238.03 : la case « premier paiement » ne compte que les loyers et cautions versés par le
 *    locataire ; un remboursement ne la décoche pas.
 */
class ListeDEntreeFaceAuxRetoursTest extends TestCase
{
    use RefreshDatabase;

    // ── P238.01 ────────────────────────────────────────────────────────────

    public function test_un_edl_d_entree_conteste_apres_signature_decoche_la_case_et_rejoue_le_rappel(): void
    {
        Notification::fake();
        $liste = $this->liste();
        $edl = $this->edl($liste->lease, InventoryStatus::PendingSignature);
        $edl->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);
        $this->assertNotNull($liste->fresh()->inventory_completed_at, 'prémisse : la signature coche la case');

        app(InventoryService::class)->dispute($edl->fresh(), 'Taches non relevées');

        $this->assertNull($liste->fresh()->inventory_completed_at);
        $liste->forceFill(['created_at' => now()->subDays(8)])->save();
        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertSentTo($liste->user, TenantInventoryReminderNotification::class);
    }

    public function test_la_liste_fermee_par_l_edl_se_rouvre_a_la_contestation(): void
    {
        $liste = $this->liste();
        $liste->forceFill(['first_payment_at' => now()])->save();
        $edl = $this->edl($liste->lease, InventoryStatus::PendingSignature);
        $edl->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);
        $this->assertNotNull($liste->fresh()->completed_at, 'prémisse : les deux cases ferment la liste');

        app(InventoryService::class)->dispute($edl->fresh(), 'Compteur faux');

        $fresh = $liste->fresh();
        $this->assertNull($fresh->completed_at);
        $this->assertNotNull($fresh->first_payment_at, 'la case du paiement ne bouge pas');
        $this->assertTrue(TenantOnboardingChecklist::query()->incomplete()->whereKey($liste->id)->exists());
    }

    public function test_un_rappel_deja_parti_avant_la_signature_rejoue_apres_la_contestation(): void
    {
        Notification::fake();
        $liste = $this->liste();
        $liste->forceFill(['created_at' => now()->subDays(8)])->save();
        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertSentToTimes($liste->user, TenantInventoryReminderNotification::class, 1);

        $edl = $this->edl($liste->lease, InventoryStatus::PendingSignature);
        $edl->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);
        app(InventoryService::class)->dispute($edl->fresh(), 'Taches non relevées');

        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertSentToTimes($liste->user, TenantInventoryReminderNotification::class, 2);

        // Et il ne rejoue qu'une fois par réouverture.
        $this->artisan(RemindTenantOnboarding::class)->assertSuccessful();
        Notification::assertSentToTimes($liste->user, TenantInventoryReminderNotification::class, 2);
    }

    public function test_un_autre_edl_d_entree_signe_garde_la_case_cochee(): void
    {
        $liste = $this->liste();
        $this->edl($liste->lease, InventoryStatus::Signed);
        $conteste = $this->edl($liste->lease, InventoryStatus::PendingSignature);
        $conteste->update(['status' => InventoryStatus::Signed, 'signed_at' => now()]);
        $coche = $liste->fresh()->inventory_completed_at;
        $this->assertNotNull($coche);

        app(InventoryService::class)->dispute($conteste->fresh(), 'Doublon');

        $this->assertEquals($coche, $liste->fresh()->inventory_completed_at);
    }

    public function test_un_edl_de_sortie_conteste_ne_touche_pas_la_liste(): void
    {
        $liste = $this->liste();
        $liste->forceFill(['inventory_completed_at' => now()])->save();
        $sortie = $this->edl($liste->lease, InventoryStatus::Signed, InventoryType::MoveOut);

        app(InventoryService::class)->dispute($sortie, 'Dégâts contestés');

        $this->assertNotNull($liste->fresh()->inventory_completed_at);
    }

    // ── P238.02 ────────────────────────────────────────────────────────────

    public function test_un_renouvellement_ne_actif_ne_recoit_ni_liste_ni_bienvenue(): void
    {
        Notification::fake();
        [$parent, $locataire] = $this->bailEnPlace();

        $enfant = $this->renouveler($parent);

        $this->assertSame(LeaseStatus::Active, $enfant->status);
        $this->assertDatabaseMissing('tenant_onboarding_checklists', ['lease_id' => $enfant->id]);
        Notification::assertNotSentTo($locataire, TenantWelcomeNotification::class);
    }

    public function test_un_renouvellement_signe_ne_recoit_ni_liste_ni_bienvenue(): void
    {
        Notification::fake();
        Setting::query()->create(['key' => 'lease.require_signature', 'value' => true]);
        [$parent, $locataire] = $this->bailEnPlace();
        $enfant = $this->renouveler($parent);
        $this->assertSame(LeaseStatus::PendingSignature, $enfant->status);

        $enfant = app(LeaseService::class)->completeActivation($enfant);

        $this->assertSame(LeaseStatus::Active, $enfant->status);
        $this->assertDatabaseMissing('tenant_onboarding_checklists', ['lease_id' => $enfant->id]);
        Notification::assertNotSentTo($locataire, TenantWelcomeNotification::class);
        $this->assertNull($enfant->fresh()->tenant_welcomed_at);
    }

    public function test_un_bail_neuf_recoit_toujours_sa_liste_et_sa_bienvenue(): void
    {
        Notification::fake();
        $locataire = User::factory()->create();
        $bail = Lease::factory()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'agency_id' => Agency::factory()->create()->id,
            'status' => LeaseStatus::Draft,
        ]);

        app(LeaseService::class)->activate($bail);

        $this->assertDatabaseHas('tenant_onboarding_checklists', ['lease_id' => $bail->id]);
        Notification::assertSentTo($locataire, TenantWelcomeNotification::class);
    }

    // ── P238.03 ────────────────────────────────────────────────────────────

    public function test_une_caution_rendue_ne_coche_pas_le_premier_paiement(): void
    {
        $liste = $this->liste();
        $restitution = $this->paiement($liste->lease, LeasePaymentType::DepositRefund);

        $restitution->update(['status' => PaymentStatus::Paid, 'paid_at' => now()]);

        $this->assertNull($liste->fresh()->first_payment_at);
    }

    public function test_une_restitution_creee_payee_ne_coche_pas_le_premier_paiement(): void
    {
        $liste = $this->liste();

        $this->paiement($liste->lease, LeasePaymentType::DepositRefund, payee: true);

        $this->assertNull($liste->fresh()->first_payment_at);
    }

    public function test_une_penalite_payee_ne_coche_pas_le_premier_paiement(): void
    {
        $liste = $this->liste();

        $this->paiement($liste->lease, LeasePaymentType::Penalty, payee: true);

        $this->assertNull($liste->fresh()->first_payment_at);
    }

    public function test_une_caution_versee_coche_le_premier_paiement(): void
    {
        $liste = $this->liste();
        $caution = $this->paiement($liste->lease, LeasePaymentType::Deposit);

        $caution->update(['status' => PaymentStatus::Paid, 'paid_at' => now()]);

        $this->assertNotNull($liste->fresh()->first_payment_at);
    }

    public function test_un_premier_loyer_rembourse_garde_la_case_cochee(): void
    {
        $liste = $this->liste();
        $loyer = $this->paiement($liste->lease, LeasePaymentType::Rent, payee: true);
        $coche = $liste->fresh()->first_payment_at;
        $this->assertNotNull($coche);

        $loyer->update(['status' => PaymentStatus::Refunded]);

        $this->assertEquals($coche, $liste->fresh()->first_payment_at);
    }

    // ── Fabriques ──────────────────────────────────────────────────────────

    private function liste(): TenantOnboardingChecklist
    {
        $locataire = User::factory()->create();
        $bail = Lease::factory()->active()->create([
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);

        return TenantOnboardingChecklist::create([
            'lease_id' => $bail->id,
            'user_id' => $locataire->id,
        ])->fresh();
    }

    private function edl(Lease $bail, InventoryStatus $statut, InventoryType $type = InventoryType::MoveIn): Inventory
    {
        return Inventory::factory()->create([
            'lease_id' => $bail->id,
            'property_id' => $bail->property_id,
            'tenant_id' => $bail->tenant_id,
            'type' => $type,
            'status' => $statut,
            'signed_at' => $statut === InventoryStatus::Signed ? now() : null,
        ]);
    }

    private function paiement(Lease $bail, LeasePaymentType $type, bool $payee = false): LeasePayment
    {
        return LeasePayment::create([
            'lease_id' => $bail->id,
            'reference_number' => 'LPY-'.$type->value.'-'.uniqid(),
            'payer_id' => $bail->tenant_id,
            'amount' => 250_000,
            'currency' => 'XOF',
            'payment_method' => $payee ? PaymentMethod::Wave : null,
            'payment_type' => $type,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'due_date' => now()->toDateString(),
            'paid_at' => $payee ? now() : null,
            'status' => $payee ? PaymentStatus::Paid : PaymentStatus::Pending,
        ]);
    }

    /**
     * Un bail en cours, sa liste d'entrée et sa bienvenue déjà reçue, comme celui d'un locataire en place.
     *
     * @return array{0: Lease, 1: User}
     */
    private function bailEnPlace(): array
    {
        $bailleur = User::factory()->create();
        $locataire = User::factory()->create();
        $parent = Lease::factory()->active()->create([
            'landlord_id' => $bailleur->id,
            'property_id' => Property::factory()->create(['user_id' => $bailleur->id])->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $locataire->id])->id,
            'agency_id' => Agency::factory()->create()->id,
            'start_date' => '2025-11-01',
            'end_date' => '2026-10-31',
            'monthly_rent' => 250_000,
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 1,
            'tenant_welcomed_at' => now()->subYear(),
        ]);
        TenantOnboardingChecklist::create(['lease_id' => $parent->id, 'user_id' => $locataire->id]);

        return [$parent, $locataire];
    }

    private function renouveler(Lease $parent): Lease
    {
        return app(LeaseRenewalService::class)->renew($parent, [
            'start_date' => '2026-11-01',
            'end_date' => '2027-10-31',
        ]);
    }
}
