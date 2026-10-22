<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\View;
use Tests\TestCase;

/**
 * Angle 109 des pistes — ce que dompdf IMPRIME, et non ce que la vue contient.
 *
 * `DocumentPdfServiceTest` lit le HTML des gabarits : il reste vert quel que soit le moteur.
 * Ces tests rendent un vrai PDF sous `laravel-pdf.driver=dompdf` (le pilote de `phpunit.xml`,
 * du développement et du plan de préproduction) et lisent le fichier produit.
 */
class DocumentPdfDompdfRenderTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-1233 (P109.01) — le logo est une URL `http(s)` du disque public, que dompdf refuse
     * (`is_remote_enabled` à `false`) : il imprimait le texte `alt` à la place, sans erreur.
     */
    public function test_the_agency_logo_is_embedded_as_a_data_uri_and_printed_as_an_image(): void
    {
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);
        $agency->addMedia(UploadedFile::fake()->image('logo.png', 800, 200))->toMediaCollection('logo');

        $captured = null;
        View::composer('pdf.invoices.default', function ($view) use (&$captured) {
            $captured = $view->getData()['agency_logo_url'] ?? null;
        });

        $bytes = $this->renderInvoice($agency);

        $this->assertIsString($captured);
        $this->assertStringStartsWith('data:image/png;base64,', $captured);
        // Réduit pour le PDF : jamais l'original à 800 px.
        $logo = base64_decode(substr($captured, strlen('data:image/png;base64,')), true);
        $this->assertLessThanOrEqual(DocumentPdfService::LOGO_MAX_WIDTH, getimagesizefromstring($logo)[0]);

        // Le PNG réduit garde son canal alpha : dompdf écrit l'image et son masque (`/SMask`).
        $this->assertGreaterThanOrEqual(1, preg_match_all('#/Subtype\s*/Image#', $bytes), 'Le PDF doit porter le logo comme image.');
    }

    public function test_an_agency_without_logo_prints_its_name_and_no_image(): void
    {
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);

        $bytes = $this->renderInvoice($agency);

        $this->assertSame(0, preg_match_all('#/Subtype\s*/Image#', $bytes));
    }

    private function renderInvoice(Agency $agency): string
    {
        $customer = Customer::factory()->create();
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'subtotal' => 250_000,
            'total_amount' => 250_000,
        ]);

        return app(DocumentPdfService::class)->render('pdf.invoices.default', [
            'invoice' => $invoice,
            'customer' => $customer,
            'agency' => $agency,
            'title' => 'Facture',
            'document_label' => 'Facture',
        ]);
    }
}
