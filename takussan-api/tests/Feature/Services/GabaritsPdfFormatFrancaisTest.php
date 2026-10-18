<?php

namespace Tests\Feature\Services;

use App\Models\Invoice;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\LaravelPdf\Drivers\PdfDriver;
use Spatie\LaravelPdf\PdfOptions;
use Tests\TestCase;

/**
 * TCK-836 (P26.06) — les nombres et les dates des actes au format français : un taux de TVA de
 * 18,5 % s'imprimait « 18.5 », et la période et les dates de reversement du relevé du bailleur en
 * ISO brut (« 2026-10-01 »).
 */
class GabaritsPdfFormatFrancaisTest extends TestCase
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

    public function test_un_taux_de_tva_decimal_s_imprime_avec_une_virgule(): void
    {
        $html = $this->facture(18.5);

        $this->assertStringContainsString('TVA (18,5%)', $html);
        $this->assertStringNotContainsString('18.5', $html);
    }

    /** Témoin : un taux entier reste sans décimale. */
    public function test_un_taux_de_tva_entier_reste_sans_decimale(): void
    {
        $this->assertStringContainsString('TVA (18%)', $this->facture(18));
    }

    public function test_le_releve_du_bailleur_date_sa_periode_et_ses_reversements_en_jour_mois_annee(): void
    {
        app(DocumentPdfService::class)->render('pdf.statements.owner', [
            'agency' => null,
            'statement' => [
                'annual' => false,
                'currency' => 'XOF',
                'agency' => ['name' => 'Agence'],
                'landlord' => ['name' => 'Bailleur'],
                'period_start' => '2026-10-01',
                'period_end' => '2026-10-31',
                'properties' => [],
                'totals' => ['gross' => 0, 'commission' => 0, 'fees' => 0, 'net' => 0],
                'payouts' => [[
                    'reference_number' => 'PO-0001',
                    'transaction_id' => null,
                    'processed_at' => '2026-10-15T09:30:00+00:00',
                    'net_amount' => 100_000,
                ]],
                'unpaid' => ['count' => 0],
            ],
        ]);

        $html = (string) $this->pilote->html;
        $this->assertStringContainsString('01/10/2026 — 31/10/2026', $html);
        $this->assertStringContainsString('<td>15/10/2026</td>', $html);
        $this->assertStringNotContainsString('2026-10-', $html);
    }

    private function facture(float $taux): string
    {
        $invoice = Invoice::factory()->create(['subtotal' => 100_000, 'tax_rate' => $taux, 'tax_amount' => 100_000 * $taux / 100, 'total_amount' => 100_000 * (1 + $taux / 100)]);

        app(DocumentPdfService::class)->render('pdf.invoices.default', [
            'invoice' => $invoice->fresh(),
            'customer' => $invoice->customer,
            'agency' => null,
        ]);

        return (string) $this->pilote->html;
    }
}
