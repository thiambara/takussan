<?php

namespace Tests\Feature\Lease;

use App\Exceptions\ApiError;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Lease\DepositRefundService;
use App\Services\Lease\GestesDuBail;
use App\Services\Model\LeasePaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-3011 (ADR-0139) — `abilities` d'un bail : chaque geste que l'API accepterait MAINTENANT pour CE
 * lecteur, policy ET état compris ({@see GestesDuBail}). La fiche (`components/leases/fiche/gestes.ts`)
 * ne compare plus le statut pour décider. Chaque clé est jugée vraie, puis fausse par son état.
 *
 * Et deux écritures qui jugeaient l'état hors verrou, sur le modèle de l'appelant : la restitution de
 * caution et la pose d'une ligne. La course se rejoue sans concurrence — l'écriture reçoit un bail chargé
 * avant qu'une autre écriture ne le change en base.
 */
class GestesDuBailTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Customer $locataire;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->buildStakeholders();
        $this->locataire = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @param  array<string, mixed>  $attributs */
    private function bail(array $attributs = []): Lease
    {
        return Lease::factory()->create($attributs + [
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->locataire->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    /** @return array<string, bool> */
    private function gestesDe(User $lecteur, Lease $bail): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/leases/{$bail->id}")->assertOk()->json('data.abilities');
    }

    private function geste(Lease $bail, string $cle, ?User $lecteur = null): bool
    {
        $gestes = $this->gestesDe($lecteur ?? $this->landlord, $bail);
        $this->assertArrayHasKey($cle, $gestes);

        return $gestes[$cle];
    }

    public function test_abilities_porte_une_cle_par_geste(): void
    {
        $this->assertSame(GestesDuBail::GESTES, array_keys($this->gestesDe($this->landlord, $this->bail())));
    }

    public function test_un_bail_actif_sans_echeancier(): void
    {
        $gestes = $this->gestesDe($this->landlord, $this->bail());

        foreach (['renew', 'review_rent', 'record_payment', 'add_payment', 'generate_schedule', 'request_early_termination'] as $vrai) {
            $this->assertTrue($gestes[$vrai], $vrai);
        }
        foreach (['cancel_early_termination', 'refund_deposit', 'abandon', 'request_signature', 'sign'] as $faux) {
            $this->assertFalse($gestes[$faux], $faux);
        }
    }

    public function test_le_locataire_ne_gere_pas_son_bail_il_donne_conge(): void
    {
        $gestes = $this->gestesDe($this->client, $this->bail());

        $this->assertTrue($gestes['request_early_termination']);
        $this->assertTrue($gestes['give_notice']);
        foreach (['renew', 'review_rent', 'record_payment', 'add_payment', 'generate_schedule', 'update', 'abandon', 'request_signature'] as $faux) {
            $this->assertFalse($gestes[$faux], $faux);
        }
    }

    public function test_une_vente_n_a_pas_de_loyer_a_reviser(): void
    {
        $this->assertFalse($this->geste($this->bail(['type' => LeaseType::Sale, 'monthly_rent' => null, 'sale_price' => 50_000_000]), 'review_rent'));
    }

    public function test_un_echeancier_emis_ne_se_genere_plus_une_caution_seule_si(): void
    {
        $bail = $this->bail();
        LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Deposit]);
        $this->assertTrue($this->geste($bail, 'generate_schedule'));

        LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Rent]);
        $this->assertFalse($this->geste($bail, 'generate_schedule'));
        $this->postJson("/api/leases/{$bail->id}/payments/generate-schedule")->assertStatus(422)->assertJsonPath('code', 'lease.schedule_exists');
    }

    /**
     * Un bail échu (sa fin est passée) se renouvelle ; il ne prend plus de ligne ni de révision, et ne
     * s'ouvre plus au préavis : toute date d'effet tombe après sa fin (`after_end_date`), l'écriture le
     * refuse toujours (vérification adverse de TCK-3011, D1).
     */
    public function test_un_bail_echu_se_renouvelle_mais_ne_prend_plus_de_ligne_ni_de_revision_ni_de_preavis(): void
    {
        $echu = $this->bail(['status' => LeaseStatus::Expired, 'start_date' => '2025-11-01', 'end_date' => '2026-10-31']);
        $gestes = $this->gestesDe($this->landlord, $echu);

        $this->assertTrue($gestes['renew']);
        $this->assertFalse($gestes['request_early_termination']);
        $this->assertFalse($gestes['add_payment']);
        $this->assertFalse($gestes['review_rent']);
        $this->assertFalse($gestes['generate_schedule']);
        $this->postJson("/api/leases/{$echu->id}/early-termination", ['effective_date' => '2027-01-15'])->assertStatus(422);
        // D4 — l'échéancier ne se génère que sur un bail actif : la règle de la clé, relue par l'écriture.
        $this->postJson("/api/leases/{$echu->id}/payments/generate-schedule")->assertStatus(422)
            ->assertJsonPath('code', 'lease.not_active_schedule');
    }

    /**
     * D1 — le préavis ne s'offre que s'il existe une date d'effet que l'écriture accepte : au plus tôt
     * aujourd'hui plus le préavis, et avant la fin du bail. Un bail actif qui finit avant n'a pas de préavis.
     */
    public function test_le_preavis_ne_s_offre_que_si_une_date_d_effet_tient_avant_la_fin(): void
    {
        // Préavis de 30 jours : au plus tôt le 2026-12-20.
        $finProche = $this->bail(['notice_period_days' => 30, 'end_date' => '2026-12-20']);
        $this->assertFalse($this->geste($finProche, 'request_early_termination'));
        $this->postJson("/api/leases/{$finProche->id}/early-termination", ['effective_date' => '2026-12-20'])->assertStatus(422);

        $finLointaine = $this->bail(['notice_period_days' => 30, 'end_date' => '2026-12-21']);
        $this->assertTrue($this->geste($finLointaine, 'request_early_termination'));
        $this->postJson("/api/leases/{$finLointaine->id}/early-termination", ['effective_date' => '2026-12-20'])->assertCreated();

        $sansFin = $this->bail(['notice_period_days' => 30, 'end_date' => null]);
        $this->assertTrue($this->geste($sansFin, 'request_early_termination'));
    }

    public function test_un_renouvellement_ouvert_arrete_le_suivant(): void
    {
        $parent = $this->bail(['status' => LeaseStatus::Expired]);
        $this->bail(['renewed_from_lease_id' => $parent->id, 'status' => LeaseStatus::Draft]);

        $this->assertFalse($this->geste($parent, 'renew'));
    }

    public function test_le_preavis_s_annule_avant_sa_date_d_effet_seulement(): void
    {
        $enPreavis = $this->bail(['status' => LeaseStatus::Terminating, 'early_termination_effective_date' => '2026-12-20']);
        $gestes = $this->gestesDe($this->landlord, $enPreavis);
        $this->assertFalse($gestes['request_early_termination']);
        $this->assertTrue($gestes['cancel_early_termination']);
        $this->assertTrue($gestes['add_payment']);

        $echu = $this->bail(['status' => LeaseStatus::Terminating, 'early_termination_effective_date' => '2026-11-20']);
        $this->assertFalse($this->geste($echu, 'cancel_early_termination'));
        $this->deleteJson("/api/leases/{$echu->id}/early-termination")->assertStatus(422);
    }

    /** D3 — une indemnité payée ferme l'annulation du préavis (`lease_early_termination_penalty_paid`). */
    public function test_une_indemnite_payee_ferme_l_annulation_du_preavis(): void
    {
        $facture = Invoice::factory()->create(['agency_id' => $this->agency->id, 'status' => InvoiceStatus::Sent]);
        $enPreavis = $this->bail([
            'status' => LeaseStatus::Terminating,
            'early_termination_effective_date' => '2026-12-20',
            'early_termination_invoice_id' => $facture->id,
        ]);
        $this->assertTrue($this->geste($enPreavis, 'cancel_early_termination'));

        $facture->forceFill(['status' => InvoiceStatus::Paid])->save();
        $this->assertFalse($this->geste($enPreavis, 'cancel_early_termination'));
        $this->deleteJson("/api/leases/{$enPreavis->id}/early-termination")->assertStatus(422);
    }

    public function test_la_caution_se_restitue_sur_un_bail_fini_qui_l_a_encaissee(): void
    {
        $this->assertTrue($this->geste(Lease::factory()->withCollectedDeposit()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->locataire->id, 'status' => LeaseStatus::Terminated,
        ]), 'refund_deposit'));

        // Jamais encaissée : l'API la refuse (`deposit_refund.not_collected`), la fiche ne l'offre plus.
        $sansCaution = $this->bail(['status' => LeaseStatus::Terminated]);
        $this->assertFalse($this->geste($sansCaution, 'refund_deposit'));
        $this->postJson("/api/leases/{$sansCaution->id}/deposit-refund", ['amount' => 1000])->assertStatus(422)->assertJsonPath('code', 'deposit_refund.not_collected');

        // Encaissée, sur un bail actif : pas encore.
        $this->assertFalse($this->geste(Lease::factory()->withCollectedDeposit()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->locataire->id, 'status' => LeaseStatus::Active,
        ]), 'refund_deposit'));
    }

    public function test_un_brouillon_s_abandonne_et_s_envoie_en_signature(): void
    {
        $brouillon = $this->bail(['status' => LeaseStatus::Draft]);
        $gestes = $this->gestesDe($this->landlord, $brouillon);

        $this->assertTrue($gestes['abandon']);
        $this->assertTrue($gestes['request_signature']);
        $this->assertFalse($gestes['add_payment']);
        $this->assertFalse($gestes['request_early_termination']);
        $this->assertFalse($gestes['renew']);
    }

    public function test_un_brouillon_qui_porte_une_echeance_ne_s_abandonne_pas(): void
    {
        $brouillon = $this->bail(['status' => LeaseStatus::Draft]);
        LeasePayment::factory()->create(['lease_id' => $brouillon->id, 'payment_type' => LeasePaymentType::Deposit]);

        $this->assertFalse($this->geste($brouillon, 'abandon'));
        $this->deleteJson("/api/leases/{$brouillon->id}")->assertStatus(422)->assertJsonPath('code', 'lease.abandon_has_payments');
    }

    public function test_le_locataire_signe_un_contrat_fige_qui_l_attend_une_fois(): void
    {
        $bail = $this->bail(['status' => LeaseStatus::PendingSignature, 'contract_sha256' => str_repeat('a', 64)]);
        $this->assertTrue($this->geste($bail, 'sign', $this->client));
        $this->assertTrue($this->geste($bail, 'request_signature'));

        $bail->signatures()->create(['role' => 'tenant', 'document_sha256' => str_repeat('a', 64), 'user_id' => $this->client->id, 'signed_at' => now(), 'method' => 'otp']);
        $this->assertFalse($this->geste($bail, 'sign', $this->client));

        $this->assertFalse($this->geste($this->bail(['status' => LeaseStatus::Draft]), 'sign', $this->client));
    }

    /* ─────────────── AC3 — les réponses des gestes portent `abilities` à jour ─────────────── */

    /**
     * La fiche ne présélectionne « Encaisser » que sur une échéance dont la LIGNE le dit
     * (`echeanceAEncaisser` lit `abilities.record_payment` de l'échéancier, plus le statut) : la ligne
     * porte la policy ET son reste dû, et l'API encaisse ce qu'elle annonce.
     */
    public function test_l_echeancier_dit_par_ligne_ce_qui_s_encaisse(): void
    {
        $bail = $this->bail(['status' => LeaseStatus::Terminated]);
        $due = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Late, 'amount' => 100000]);
        $payee = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Paid, 'amount' => 100000]);

        Sanctum::actingAs($this->landlord);
        $lignes = collect($this->getJson("/api/leases/{$bail->id}/payments")->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($lignes[$due->id]['abilities']['record_payment']);
        $this->assertFalse($lignes[$payee->id]['abilities']['record_payment']);
        // Un bail fini ne prend plus de ligne, mais son reste dû s'encaisse encore.
        $this->assertFalse($this->geste($bail, 'add_payment'));
        $this->postJson("/api/lease-payments/{$due->id}/mark-paid", [])->assertOk();

        Sanctum::actingAs($this->client);
        $this->assertFalse(collect($this->getJson("/api/leases/{$bail->id}/payments")->json('data'))->firstWhere('id', $due->id)['abilities']['record_payment']);
    }

    /**
     * D2 — une ligne ne s'annonce encaissable que si `markPaid` l'encaisse : une échéance en échec, une
     * restitution de caution (réglée par son reversement) ou une ligne annulée ne s'offrent pas.
     */
    public function test_une_ligne_ne_s_annonce_encaissable_que_si_l_encaissement_l_accepte(): void
    {
        $bail = $this->bail();
        $echec = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Failed, 'amount' => 100000]);
        $restitution = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::DepositRefund, 'status' => PaymentStatus::Pending, 'amount' => 100000]);
        $annulee = LeasePayment::factory()->create(['lease_id' => $bail->id, 'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Cancelled, 'amount' => 100000]);

        Sanctum::actingAs($this->landlord);
        $lignes = collect($this->getJson("/api/leases/{$bail->id}/payments")->assertOk()->json('data'))->keyBy('id');
        foreach ([$echec, $restitution, $annulee] as $ligne) {
            $this->assertFalse($lignes[$ligne->id]['abilities']['record_payment'], "ligne {$ligne->status->value} {$ligne->payment_type->value}");
            $this->assertContains($this->postJson("/api/lease-payments/{$ligne->id}/mark-paid", [])->status(), [409, 422]);
        }
    }

    public function test_ac3_la_reponse_d_un_geste_du_bail_porte_ses_abilities_a_jour(): void
    {
        $bail = $this->bail();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/leases/{$bail->id}/early-termination", ['effective_date' => '2027-01-15'])->assertCreated()
            ->assertJsonPath('data.status', 'terminating')
            ->assertJsonPath('data.abilities.request_early_termination', false)
            ->assertJsonPath('data.abilities.cancel_early_termination', true);

        $this->deleteJson("/api/leases/{$bail->id}/early-termination")->assertOk()
            ->assertJsonPath('data.abilities.request_early_termination', true)
            ->assertJsonPath('data.abilities.cancel_early_termination', false);

        Sanctum::actingAs($this->landlord);
        $this->patchJson("/api/leases/{$bail->id}/rent", ['new_rent' => (float) $bail->monthly_rent + 1000, 'reason' => 'Révision annuelle'])->assertOk()
            ->assertJsonPath('data.abilities.review_rent', true);
        $brouillon = $this->bail(['status' => LeaseStatus::Draft]);
        $this->patchJson("/api/leases/{$brouillon->id}", ['late_fee_percent' => 5])->assertOk()
            ->assertJsonPath('data.abilities.abandon', true)
            ->assertJsonPath('data.abilities.request_signature', true);
    }

    /* ─────────────── Les écritures relisent l'état sous verrou ─────────────── */

    public function test_une_caution_ne_se_restitue_pas_sur_un_bail_renouvele_derriere_l_ecran(): void
    {
        $bail = Lease::factory()->withCollectedDeposit()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->locataire->id, 'status' => LeaseStatus::Expired,
        ]);
        $perime = Lease::query()->findOrFail($bail->id);
        Lease::query()->whereKey($bail->id)->update(['status' => LeaseStatus::Renewed->value]);

        try {
            app(DepositRefundService::class)->refund($perime, $this->landlord, ['amount' => (float) $bail->deposit_amount]);
            $this->fail('La caution d\'un bail renouvelé passe au bail suivant : elle ne se rend pas.');
        } catch (ApiError $e) {
            $this->assertSame('deposit_refund.lease_not_ended', $e->errorCode);
        }
        $this->assertSame(0, $bail->payments()->where('payment_type', LeasePaymentType::DepositRefund->value)->count());
    }

    public function test_une_ligne_ne_se_pose_pas_sur_un_bail_resilie_derriere_l_ecran(): void
    {
        $bail = $this->bail();
        $perime = Lease::query()->findOrFail($bail->id);
        Lease::query()->whereKey($bail->id)->update(['status' => LeaseStatus::Terminated->value]);

        try {
            app(LeasePaymentService::class)->create($perime, $this->landlord, [
                'amount' => 10_000, 'payment_type' => LeasePaymentType::Charges->value, 'status' => PaymentStatus::Pending->value,
                'period_start' => '2026-11-01', 'period_end' => '2026-11-30', 'due_date' => '2026-11-05',
            ]);
            $this->fail('Une ligne ne se pose que sur un bail qui court.');
        } catch (ApiError $e) {
            $this->assertSame('lease_payment.lease_not_active', $e->errorCode);
        }
        $this->assertSame(0, $bail->payments()->count());
    }
}
