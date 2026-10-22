<?php

namespace Tests\Feature\Api;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P133.02 (TCK-1377) — les lignes saisies au dialogue de facture partent à l'API, qui recompte le
 * sous-total depuis elles et les imprime. Avant, seul un `subtotal` calculé au navigateur arrivait,
 * accepté tel quel, et le PDF imprimait une ligne « Prestation » au montant total.
 */
class InvoiceLinesTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** Le HTML que le gabarit a rendu pour la requête, capturé au passage de la vue. */
    private function pdfHtml(Invoice $invoice, User $actor): string
    {
        $captured = null;
        View::composer('pdf.invoices.default', function ($v) use (&$captured): void {
            $captured = $v->getData();
        });

        Sanctum::actingAs($actor);
        $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk();
        $this->assertNotNull($captured, "Le gabarit de la facture n'a pas été rendu.");

        return view('pdf.invoices.default', $captured)->render();
    }

    public function test_les_lignes_envoyees_font_le_sous_total_et_s_impriment(): void
    {
        [, $admin, $customer] = $this->invoicingAgency(['default_tax_rate' => 18]);
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => '2026-10-22',
            // Un sous-total fourni ne compte plus : l'API le recompte depuis les lignes.
            'subtotal' => 1,
            'tax_rate' => 18,
            'items' => [
                ['description' => 'Frais de dossier', 'quantity' => 1, 'unit_price' => 25000],
                ['description' => 'Visite accompagnée', 'quantity' => 2, 'unit_price' => 10000],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.subtotal', 45000)
            ->assertJsonPath('data.tax_amount', 8100)
            ->assertJsonPath('data.total_amount', 53100);

        $invoice = Invoice::findOrFail($response->json('data.id'));
        // `assertEquals` : jsonb range les clés à sa façon.
        $this->assertEquals([
            ['label' => 'Frais de dossier', 'qty' => '1', 'unit_price' => '25000.00', 'total' => '25000.00'],
            ['label' => 'Visite accompagnée', 'qty' => '2', 'unit_price' => '10000.00', 'total' => '20000.00'],
        ], $invoice->lines());

        $html = $this->pdfHtml($invoice, $admin);
        $this->assertStringContainsString('Frais de dossier', $html);
        $this->assertStringContainsString('Visite accompagnée', $html);
        $this->assertStringNotContainsString('Prestation', $html);
    }

    public function test_chaque_ligne_s_arrondit_a_l_unite_de_la_devise_avant_la_somme(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);
        $line = ['description' => 'Fourniture', 'quantity' => 1.5, 'unit_price' => 333];

        // 1,5 × 333 = 499,5 → 500 en XOF, trois fois.
        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => '2026-10-22',
            'currency' => 'XOF',
            'items' => [$line, $line, $line],
        ])->assertCreated()->assertJsonPath('data.subtotal', 1500);
    }

    public function test_une_ligne_incomplete_ou_une_liste_vide_est_refusee(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);
        $body = ['customer_id' => $customer->id, 'issue_date' => '2026-10-22'];

        $this->postJson('/api/invoices', $body + ['items' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['items']);
        $this->postJson('/api/invoices', $body + ['items' => [['quantity' => 0, 'unit_price' => -1]]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.description', 'items.0.quantity', 'items.0.unit_price']);
        // Ni lignes ni sous-total : rien à facturer.
        $this->postJson('/api/invoices', $body)->assertStatus(422)->assertJsonValidationErrors(['subtotal']);
    }

    public function test_un_total_au_dela_de_la_colonne_est_refuse_sans_500(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);
        $line = ['description' => 'Lot', 'quantity' => 100000, 'unit_price' => 1000000000];

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => '2026-10-22',
            'items' => [$line, $line],
        ])->assertStatus(422)->assertJsonPath('code', 'invoice.amount_too_large');
    }

    public function test_sans_lignes_le_sous_total_fourni_reste_accepte(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/invoices', [
            'customer_id' => $customer->id, 'issue_date' => '2026-10-22', 'subtotal' => 30000,
        ])->assertCreated()->assertJsonPath('data.subtotal', 30000);

        $this->assertNull(Invoice::findOrFail($response->json('data.id'))->lines());
    }
}
