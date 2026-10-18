<?php

namespace Tests\Feature\Services;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\LaravelPdf\Drivers\PdfDriver;
use Spatie\LaravelPdf\PdfOptions;
use Tests\TestCase;

/**
 * TCK-834 (P26.03) — une échéance trimestrielle ou annuelle couvre plusieurs mois (TCK-667) : sa
 * quittance imprime « du … au … ». Avant, la « Période » ne lisait que `period_start` et disait
 * « Janvier 2027 » pour un trimestre. Une échéance d'un mois garde son mois.
 */
class QuittancePeriodeTest extends TestCase
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

    public function test_une_echeance_trimestrielle_imprime_du_premier_au_dernier_jour(): void
    {
        $html = $this->rendre('2027-01-01', '2027-03-31');

        $this->assertStringContainsString('Du 1 janvier 2027 au 31 mars 2027', $html);
        $this->assertStringNotContainsString('<td>Janvier 2027</td>', $html);
    }

    public function test_une_echeance_annuelle_imprime_du_premier_au_dernier_jour(): void
    {
        $this->assertStringContainsString('Du 1 janvier 2027 au 31 décembre 2027', $this->rendre('2027-01-01', '2027-12-31'));
    }

    /** Témoin : une échéance d'un mois, même décalée, garde son mois. */
    public function test_une_echeance_mensuelle_garde_son_mois(): void
    {
        $this->assertStringContainsString('<td>Octobre 2026</td>', $this->rendre('2026-10-01', '2026-10-31'));
        $this->assertStringContainsString('<td>Octobre 2026</td>', $this->rendre('2026-10-15', '2026-11-14'));
    }

    private function rendre(string $debut, string $fin): string
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
        ]);
        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 1_200_000,
            'period_start' => $debut,
            'period_end' => $fin,
        ]);

        app(DocumentPdfService::class)->render('pdf.receipts.rent', [
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $tenant,
            'property' => $property,
            'agency' => null,
        ]);

        return (string) $this->pilote->html;
    }
}
