<?php

namespace Tests\Feature\Api;

use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC13) — une facture émise ne s'annule que par un avoir du même montant.
 */
class InvoiceCreditNoteTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac13_cancelling_an_issued_invoice_creates_a_credit_note(): void
    {
        $this->travelTo('2026-10-07 10:00:00');
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $invoice = $this->draftOf($agency, $customer, 118_000);
        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();

        $this->postJson("/api/invoices/{$invoice->id}/cancel")->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $note = Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->sole();
        $this->assertSame('AV-2026-00001', $note->reference_number);
        $this->assertSame($invoice->id, $note->credited_invoice_id);
        $this->assertEquals(118000, (float) $note->total_amount);
        $this->assertSame(InvoiceStatus::Void, $note->status);
        $this->assertSame($admin->id, $note->issued_by_id);

        // L'avoir se lit sur l'originale.
        $this->getJson("/api/invoices/{$invoice->id}")->assertOk()
            ->assertJsonPath('data.credit_notes.0.reference_number', 'AV-2026-00001');
        // Et un avoir ne s'annule pas.
        $this->postJson("/api/invoices/{$note->id}/cancel")->assertStatus(422);
    }

    public function test_ac13_cancelling_a_draft_creates_no_credit_note(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $draft = $this->draftOf($agency, $customer, 118_000);
        Sanctum::actingAs($admin);

        $this->postJson("/api/invoices/{$draft->id}/cancel")->assertOk();

        $this->assertSame(0, Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->count());
    }

    /**
     * P231.04 (TCK-2316) — l'avoir d'une facture saisie par lignes imprime ces lignes, pas une
     * ligne unique « Prestation ». Les notes de l'originale ne le suivent pas.
     */
    public function test_l_avoir_recopie_les_lignes_de_la_facture_qu_il_annule(): void
    {
        $this->travelTo('2026-10-25 10:00:00');
        [, $admin, $customer] = $this->invoicingAgency();
        Sanctum::actingAs($admin);
        $id = $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => '2026-10-25',
            'tax_rate' => 0,
            'notes' => 'Réglable sous huit jours',
            'items' => [
                ['description' => 'Frais de dossier', 'quantity' => 1, 'unit_price' => 25000],
                ['description' => 'Visite accompagnée', 'quantity' => 2, 'unit_price' => 10000],
            ],
        ])->assertCreated()->json('data.id');
        $invoice = Invoice::findOrFail($id);
        $this->postJson("/api/invoices/{$id}/send")->assertOk();
        $this->postJson("/api/invoices/{$id}/cancel")->assertOk();

        $note = Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->sole();
        $this->assertEquals(45000, (float) $note->total_amount);
        $this->assertEquals($invoice->lines(), $note->lines());
        $this->assertNull($note->notes);

        $html = $this->pdfHtml($note, $admin);
        $this->assertStringContainsString('Frais de dossier', $html);
        $this->assertStringContainsString('Visite accompagnée', $html);
        $this->assertStringNotContainsString('Prestation', $html);
    }

    public function test_l_avoir_recopie_la_designation_et_la_fige_a_son_emission(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $invoice = $this->draftOf($agency, $customer, 30_000);
        $invoice->update(['metadata' => ['designation' => 'Honoraires de gestion — octobre']]);
        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();
        $this->postJson("/api/invoices/{$invoice->id}/cancel")->assertOk();

        $note = Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->sole();
        $this->assertSame('Honoraires de gestion — octobre', $note->metadata['designation'] ?? null);
        $this->assertSame('Honoraires de gestion — octobre', $note->metadata['issued']['designation'] ?? null);
        $this->assertStringContainsString('Honoraires de gestion — octobre', $this->pdfHtml($note, $admin));
    }

    /** Le HTML que le gabarit a rendu pour la requête, capturé au passage de la vue. */
    private function pdfHtml(Invoice $invoice, User $actor): string
    {
        $captured = null;
        View::composer('pdf.invoices.default', function ($v) use (&$captured): void {
            $captured = $v->getData();
        });

        Sanctum::actingAs($actor);
        $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk();
        $this->assertNotNull($captured, "Le gabarit de l'avoir n'a pas été rendu.");

        return view('pdf.invoices.default', $captured)->render();
    }
}
