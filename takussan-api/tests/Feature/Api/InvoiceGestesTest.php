<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Invoice\GestesDeLaFacture;
use App\Services\Model\InvoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-3011 (ADR-0139) — `abilities` d'une facture : chaque geste que l'API accepterait MAINTENANT pour
 * CE lecteur, policy et état compris ({@see GestesDeLaFacture}). Une clé par geste, vraie puis fausse.
 * La fiche (`InvoiceDetailDialog`) ne juge plus le statut : elle offrait « Payer en ligne » sur un
 * brouillon, que l'API refuse (409 `payment.not_payable`).
 */
class InvoiceGestesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, bool> */
    private function gestesDe(User $lecteur, Invoice $facture): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/invoices/{$facture->id}")->assertOk()->json('data.abilities');
    }

    private function emetteur(): User
    {
        return User::factory()->create();
    }

    public function test_abilities_porte_une_cle_par_geste(): void
    {
        $emetteur = $this->emetteur();
        $facture = Invoice::factory()->create(['issued_by_id' => $emetteur->id]);

        $this->assertSame(GestesDeLaFacture::GESTES, array_keys($this->gestesDe($emetteur, $facture)));
    }

    public function test_un_brouillon_s_envoie_s_encaisse_s_annule_et_ne_se_paie_pas_en_ligne(): void
    {
        $emetteur = $this->emetteur();
        $gestes = $this->gestesDe($emetteur, Invoice::factory()->create(['issued_by_id' => $emetteur->id]));

        $this->assertTrue($gestes['send']);
        $this->assertTrue($gestes['mark_paid']);
        $this->assertTrue($gestes['cancel']);
        $this->assertFalse($gestes['pay']);
    }

    /** AC2 — une facture non brouillon ne propose pas l'envoi, et l'API le refuse. */
    public function test_ac2_une_facture_emise_ne_s_envoie_plus_et_l_api_le_refuse(): void
    {
        $emetteur = $this->emetteur();
        $facture = Invoice::factory()->sent()->create(['issued_by_id' => $emetteur->id]);
        $gestes = $this->gestesDe($emetteur, $facture);

        $this->assertFalse($gestes['send']);
        $this->assertTrue($gestes['mark_paid']);
        $this->assertTrue($gestes['cancel']);
        $this->assertTrue($gestes['pay']);

        $this->postJson("/api/invoices/{$facture->id}/send")->assertStatus(422)->assertJsonPath('code', 'invoice.not_draft_send');
    }

    public function test_une_facture_payee_n_offre_plus_aucun_geste(): void
    {
        $emetteur = $this->emetteur();
        $gestes = $this->gestesDe($emetteur, Invoice::factory()->paid()->create(['issued_by_id' => $emetteur->id]));

        $this->assertSame(array_fill_keys(GestesDeLaFacture::GESTES, false), $gestes);
    }

    public function test_une_facture_annulee_n_offre_plus_aucun_geste(): void
    {
        $emetteur = $this->emetteur();
        $facture = Invoice::factory()->create(['issued_by_id' => $emetteur->id, 'status' => InvoiceStatus::Cancelled]);

        $this->assertSame(array_fill_keys(GestesDeLaFacture::GESTES, false), $this->gestesDe($emetteur, $facture));
    }

    public function test_le_client_lit_sa_facture_sans_aucun_geste(): void
    {
        $client = User::factory()->create();
        $facture = Invoice::factory()->sent()->create([
            'issued_by_id' => $this->emetteur()->id,
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
        ]);

        $this->assertSame(array_fill_keys(GestesDeLaFacture::GESTES, false), $this->gestesDe($client, $facture));
    }

    public function test_la_reponse_d_un_geste_porte_les_abilities_a_jour(): void
    {
        $emetteur = $this->emetteur();
        $facture = Invoice::factory()->create(['issued_by_id' => $emetteur->id]);
        Sanctum::actingAs($emetteur);

        $this->postJson("/api/invoices/{$facture->id}/send")->assertOk()
            ->assertJsonPath('data.abilities.send', false)
            ->assertJsonPath('data.abilities.pay', true);
    }

    public function test_la_liste_ne_porte_pas_de_gestes(): void
    {
        $emetteur = $this->emetteur();
        Invoice::factory()->create(['issued_by_id' => $emetteur->id]);
        Sanctum::actingAs($emetteur);

        $this->assertArrayNotHasKey('abilities', $this->getJson('/api/invoices')->assertOk()->json('data.0'));
    }

    /**
     * La règle d'état se juge sur la ligne relue sous verrou, par le même prédicat : un brouillon chargé,
     * puis émis en base derrière lui, ne s'émet pas une seconde fois.
     */
    public function test_l_envoi_d_un_brouillon_perime_est_refuse_sous_verrou(): void
    {
        $facture = Invoice::factory()->create(['issued_by_id' => $this->emetteur()->id]);
        $perime = Invoice::query()->findOrFail($facture->id);
        Invoice::query()->whereKey($facture->id)->update(['status' => InvoiceStatus::Paid->value]);

        try {
            app(InvoiceService::class)->send($perime);
            $this->fail('Une facture payée ne s\'envoie pas.');
        } catch (ApiError $e) {
            $this->assertSame('invoice.not_draft_send', $e->errorCode);
        }
        $this->assertSame(InvoiceStatus::Paid, Invoice::query()->findOrFail($facture->id)->status);
    }
}
