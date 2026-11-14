<?php

namespace Tests\Feature\Payments;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2650 — `GET /api/{paymentType}/{paymentId}/verify` rend le paiement LU EN BASE (`data.payment`) :
 * la page de retour ne croit plus l'adresse (P1 de l'audit). Le montant de la ligne, la devise, la
 * nature, la référence, le fournisseur (code), la date de paiement ; le bail et sa période pour une
 * échéance de loyer seulement. Le statut serveur reste `data.status`, à côté (le front le lit là).
 * Jamais un téléphone ni l'identité du payeur.
 *
 * La forme est celle que consomme le front (`PaiementVerifie`, `hooks/useInitiatePayment.ts`).
 * L'autorisation existait déjà (`authorize('update', …)` des trois policies, `findOrFail`) : les cas
 * 403 et 404 la fixent pour la page de retour.
 */
class VerifyPaiementLuEnBaseTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private const TELEPHONE_DU_PAYEUR = '+221771234598';

    public function test_le_locataire_lit_son_echeance_en_cours_puis_payee(): void
    {
        // La pénalité encaissée en ligne : le checkout demande 157 500, la ligne en vaut 150 000.
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $spy = $this->spyDriver();
        $ctx['payment']->update(['period_start' => '2026-12-01', 'period_end' => '2026-12-31']);
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', PaymentStatus::Late->value)
            ->assertJsonPath('data.payment', [
                // Le montant de LA LIGNE (contrat du front, terrain-8)…
                'amount' => 150000,
                // … et celui que le fournisseur débite : la ligne plus la pénalité encaissée en ligne.
                'checkout_amount' => 157500,
                // Décision 6a — « dont pénalité de retard » : la part figée de ce checkout.
                'checkout_late_fee_amount' => 7500,
                'currency' => 'XOF',
                'payment_type' => $ctx['payment']->payment_type?->value,
                'reference_number' => $ctx['payment']->reference_number,
                'provider' => 'wave',
                'paid_at' => null,
                'lease_id' => $ctx['lease']->id,
                'period_start' => '2026-12-01',
                'period_end' => '2026-12-31',
            ]);

        $spy->verifyStatus = DriverStatus::SUCCESS;
        $reponse = $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")->assertOk()
            ->assertJsonPath('data.status', PaymentStatus::Paid->value)
            ->assertJsonMissingPath('data.payment.status');

        $this->assertSame(
            $ctx['payment']->refresh()->paid_at?->utc()->format('Y-m-d\TH:i:sP'),
            $reponse->json('data.payment.paid_at'),
        );
        $this->assertNotNull($reponse->json('data.payment.paid_at'));
    }

    public function test_un_checkout_sans_penalite_en_ligne_en_porte_une_part_nulle(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.payment.amount', 150000)
            ->assertJsonPath('data.payment.checkout_amount', 150000)
            ->assertJsonPath('data.payment.checkout_late_fee_amount', 0);
    }

    public function test_sans_checkout_ni_fournisseur_ni_montant_debite(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.payment.amount', 150000)
            ->assertJsonPath('data.payment.checkout_amount', null)
            ->assertJsonPath('data.payment.checkout_late_fee_amount', null)
            ->assertJsonPath('data.payment.provider', null);
    }

    public function test_un_fournisseur_inconnu_dans_les_metadonnees_n_est_pas_rendu(): void
    {
        $ctx = $this->leaseDue(payment: ['metadata' => ['gateway' => ['provider' => '<script>']]]);
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.payment.provider', null);
    }

    public function test_ni_telephone_ni_identite_du_payeur(): void
    {
        $ctx = $this->leaseDue(payment: ['metadata' => [
            'gateway' => ['provider' => 'wave', 'customer_msisdn' => self::TELEPHONE_DU_PAYEUR],
            'payer_phone' => self::TELEPHONE_DU_PAYEUR,
        ]]);
        $ctx['tenant']->forceFill(['phone' => self::TELEPHONE_DU_PAYEUR])->save();
        $ctx['lease']->tenant->forceFill(['phone' => self::TELEPHONE_DU_PAYEUR, 'email' => 'awa.payeuse@example.test'])->save();
        Sanctum::actingAs($ctx['tenant']);

        $reponse = $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.payment.provider', 'wave')
            ->assertJsonMissingPath('data.payment.phone')
            ->assertJsonMissingPath('data.payment.payer')
            ->assertJsonMissingPath('data.payment.payer_id')
            ->assertJsonMissingPath('data.payment.metadata');

        $corps = (string) $reponse->getContent();
        $this->assertStringNotContainsString('771234598', $corps);
        $this->assertStringNotContainsString('awa.payeuse', $corps);
        $this->assertSame(
            ['amount', 'checkout_amount', 'checkout_late_fee_amount', 'currency', 'payment_type', 'reference_number', 'provider', 'paid_at', 'lease_id', 'period_start', 'period_end'],
            array_keys($reponse->json('data.payment')),
        );
    }

    public function test_le_paiement_d_un_autre_locataire_est_refuse(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/lease-payments/{$ctx['payment']->id}/verify")->assertForbidden()
            ->assertJsonMissingPath('data.payment')
            ->assertJsonMissingPath('data');
    }

    public function test_un_paiement_inconnu_est_introuvable(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson('/api/lease-payments/999999999/verify')->assertNotFound()->assertJsonMissingPath('data');
    }

    public function test_un_acompte_de_reservation_ne_porte_aucun_champ_de_bail(): void
    {
        $ctx = $this->leaseDue();
        $client = User::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $ctx['agency']->id])->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $ctx['agency']->id, 'user_id' => $client->id])->id,
            'agency_id' => $ctx['agency']->id,
            'currency' => Currency::XOF,
        ]);
        $acompte = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'orange_money']],
        ]);
        Sanctum::actingAs($client);

        $this->getJson("/api/booking-payments/{$acompte->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', PaymentStatus::Pending->value)
            ->assertJsonPath('data.payment.amount', 50000)
            ->assertJsonPath('data.payment.payment_type', BookingPaymentType::Deposit->value)
            ->assertJsonPath('data.payment.provider', 'orange_money')
            ->assertJsonMissingPath('data.payment.lease_id')
            ->assertJsonMissingPath('data.payment.period_start')
            ->assertJsonMissingPath('data.payment.period_end');

        // Le locataire du bail n'est pas le client de cette réservation.
        Sanctum::actingAs($ctx['tenant']);
        $this->getJson("/api/booking-payments/{$acompte->id}/verify")->assertForbidden();
    }

    public function test_une_facture_ne_porte_aucun_champ_de_bail(): void
    {
        $ctx = $this->leaseDue();
        $facture = Invoice::factory()->create([
            'agency_id' => $ctx['agency']->id,
            'total_amount' => 25000,
            'currency' => Currency::XOF,
        ]);
        Sanctum::actingAs($ctx['agent']);

        $this->getJson("/api/invoices/{$facture->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.payment.amount', 25000)
            ->assertJsonPath('data.payment.payment_type', null)
            ->assertJsonMissingPath('data.payment.lease_id')
            ->assertJsonMissingPath('data.payment.period_start');
    }
}
