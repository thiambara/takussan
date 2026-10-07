<?php

namespace Tests\Feature\Api;

use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
