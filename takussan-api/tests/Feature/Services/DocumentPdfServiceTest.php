<?php

namespace Tests\Feature\Services;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Tests\TestCase;

/**
 * TCK-077 — unit tests for the PDF rendering service.
 */
class DocumentPdfServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_render_returns_valid_pdf_binary(): void
    {
        $lease = Lease::factory()->create();
        $property = $lease->property;
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 400_000,
        ]);

        $bytes = app(DocumentPdfService::class)->render('pdf.receipts.rent', [
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $lease->tenant,
            'property' => $property,
            'agency' => null,
            'title' => 'Quittance',
            'document_label' => 'Quittance',
        ]);

        $this->assertIsString($bytes);
        $this->assertTrue(
            str_starts_with($bytes, '%PDF-'),
            'Rendered content should start with %PDF- magic bytes.'
        );
        $this->assertGreaterThan(500, strlen($bytes));
    }

    public function test_store_creates_document_linked_to_model(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $invoice = Invoice::factory()->create([
            'customer_id' => Customer::factory()->create()->id,
            'issued_by_id' => $user->id,
            'subtotal' => 100_000,
            'total_amount' => 100_000,
        ]);

        $document = app(DocumentPdfService::class)->store(
            'pdf.invoices.default',
            [
                'invoice' => $invoice,
                'customer' => $invoice->customer,
                'agency' => null,
                'title' => 'Facture '.$invoice->reference_number,
                'document_label' => 'Facture',
            ],
            $invoice,
            'invoice-test.pdf',
        );

        $this->assertInstanceOf(Document::class, $document);
        $this->assertDatabaseHas('documents', [
            'id' => $document->id,
            'documentable_id' => $invoice->id,
            'documentable_type' => Invoice::class,
            'uploaded_by' => $user->id,
        ]);
        $this->assertNotNull($document->getFirstMedia('file'));
        $this->assertSame('invoice-test.pdf', $document->getFirstMedia('file')->file_name);
    }

    public function test_receipt_html_contains_tenant_and_amount(): void
    {
        $tenant = Customer::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        $property = Property::factory()->create(['title' => 'Villa Almadies']);
        $lease = Lease::factory()->create([
            'tenant_id' => $tenant->id,
            'property_id' => $property->id,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 400_000,
            'period_start' => '2026-04-01',
            'period_end' => '2026-04-30',
        ]);

        $html = View::make('pdf.receipts.rent', [
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $tenant,
            'property' => $lease->property,
            'agency' => null,
            'title' => 'Quittance',
            'document_label' => 'Quittance',
            'footer_note' => 'Document généré le 23/04/2026 00:00 — Takussan',
        ])->render();

        // Normalise NBSP / NNBSP introduced by ICU's locale-aware grouping.
        $normalized = preg_replace('/[\x{00A0}\x{202F}\x{2009}]/u', ' ', $html) ?? $html;

        $this->assertStringContainsString('Awa Diop', $normalized);
        $this->assertStringContainsString('400 000', $normalized);
        // TCK-084 — XOF displays as "F CFA" (verbose CFA franc symbol).
        $this->assertStringContainsString('F CFA', $normalized);
        $this->assertStringContainsString('Takussan', $normalized);
        // Pagination markers come from the base layout
        $this->assertStringContainsString('page-number', $html);
        $this->assertStringContainsString('page-total', $html);
    }

    public function test_invoice_html_contains_total_and_logo_when_agency_has_one(): void
    {
        $customer = Customer::factory()->create();
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'subtotal' => 250_000,
            'total_amount' => 250_000,
        ]);

        $html = View::make('pdf.invoices.default', [
            'invoice' => $invoice,
            'customer' => $customer,
            'agency' => null,
            'agency_logo_url' => 'https://example.com/logo.png',
            'title' => 'Facture',
            'document_label' => 'Facture',
            'footer_note' => 'Document généré le 23/04/2026 00:00 — Takussan',
        ])->render();

        // Normalise NBSP / NNBSP introduced by ICU's locale-aware grouping.
        $normalized = preg_replace('/[\x{00A0}\x{202F}\x{2009}]/u', ' ', $html) ?? $html;

        $this->assertStringContainsString('https://example.com/logo.png', $normalized);
        $this->assertStringContainsString('250 000', $normalized);
        $this->assertStringContainsString('Total TTC', $normalized);
    }
}
