<?php

namespace Tests\Feature\Services;

use App\Models\Booking;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\LaravelPdf\Drivers\PdfDriver;
use Spatie\LaravelPdf\PdfOptions;
use Tests\TestCase;

/**
 * TCK-835 (P26.05) — la facture PDF dit ce qu'elle facture : sa ligne de détail prend la
 * désignation de l'objet facturé (`invoiceable`), à défaut la clé `metadata.designation`, et ne
 * retombe sur « Prestation » que sans l'un ni l'autre. Avant, le contrôleur ne passait aucune
 * ligne et toute facture imprimait « Prestation ».
 */
class FactureDesignationTest extends TestCase
{
    use RefreshDatabase;

    private object $pilote;

    protected function setUp(): void
    {
        parent::setUp();

        $this->pilote = new class implements PdfDriver
        {
            public ?string $html = null;

            public function generatePdf(string $html, ?string $headerHtml, ?string $footerHtml, PdfOptions $options): string
            {
                $this->html = $html;

                return '%PDF-1.4 capture';
            }

            public function savePdf(string $html, ?string $headerHtml, ?string $footerHtml, PdfOptions $options, string $path): void
            {
                $this->html = $html;
            }
        };

        $this->app->instance(PdfDriver::class, $this->pilote);
    }

    /** L'indemnité de résiliation et la retenue sur caution sont émises sur le bail. */
    public function test_une_facture_de_bail_designe_le_bail_et_son_bien(): void
    {
        $property = Property::factory()->create(['title' => 'Villa Almadies']);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'reference_number' => 'LS-2027-0042']);

        $html = $this->rendre(Invoice::factory()->create([
            'invoiceable_type' => Lease::class,
            'invoiceable_id' => $lease->id,
        ]));

        $this->assertStringContainsString('<td>Bail LS-2027-0042 — Villa Almadies</td>', $html);
        $this->assertStringNotContainsString('<td>Prestation</td>', $html);
    }

    public function test_un_bail_supprime_reste_la_designation_de_sa_facture(): void
    {
        $lease = Lease::factory()->create(['reference_number' => 'LS-2027-0043']);
        $invoice = Invoice::factory()->create(['invoiceable_type' => Lease::class, 'invoiceable_id' => $lease->id]);
        $lease->delete();

        $this->assertStringContainsString('Bail LS-2027-0043', $this->rendre($invoice));
    }

    public function test_une_facture_de_reservation_designe_la_reservation_et_son_bien(): void
    {
        $property = Property::factory()->create(['title' => 'Studio Plateau']);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'reference_number' => 'BK-0007']);

        $html = $this->rendre(Invoice::factory()->create([
            'invoiceable_type' => Booking::class,
            'invoiceable_id' => $booking->id,
        ]));

        $this->assertStringContainsString('<td>Réservation BK-0007 — Studio Plateau</td>', $html);
    }

    public function test_sans_objet_facture_la_cle_metadata_fait_la_designation(): void
    {
        $html = $this->rendre(Invoice::factory()->create(['metadata' => ['designation' => 'Frais de dossier']]));

        $this->assertStringContainsString('<td>Frais de dossier</td>', $html);
    }

    /** Témoin : ni objet ni clé, la facture garde « Prestation ». */
    public function test_sans_objet_ni_cle_la_designation_reste_prestation(): void
    {
        $this->assertStringContainsString('<td>Prestation</td>', $this->rendre(Invoice::factory()->create()));
    }

    private function rendre(Invoice $invoice): string
    {
        app(DocumentPdfService::class)->render('pdf.invoices.default', [
            'invoice' => $invoice->fresh(),
            'customer' => $invoice->customer,
            'agency' => null,
        ]);

        return (string) $this->pilote->html;
    }
}
