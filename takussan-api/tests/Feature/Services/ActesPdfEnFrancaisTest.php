<?php

namespace Tests\Feature\Services;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Drivers\PdfDriver;
use Spatie\LaravelPdf\PdfOptions;
use Tests\TestCase;

/**
 * TCK-672 (P06.03) — les actes (bail, état des lieux, quittances, facture) restent en français,
 * quelle que soit la langue du lecteur : leurs dates se rendent en français. Avant, la quittance
 * d'un lecteur anglophone portait « October 2026 » (et « Oktoobar 2026 » en wolof) au milieu d'un texte français.
 *
 * Le pilote PDF est remplacé par un pilote qui garde le HTML qu'on lui passe : on lit ce que le
 * document imprime, pas une reconstitution.
 */
class ActesPdfEnFrancaisTest extends TestCase
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

    /** @return array{0: Lease, 1: LeasePayment, 2: User} */
    private function quittance(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);

        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
        ]);

        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 400_000,
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
        ]);

        return [$lease, $payment, $tenantUser];
    }

    public function test_la_quittance_demandee_en_anglais_porte_le_mois_en_francais(): void
    {
        [$lease, $payment, $tenantUser] = $this->quittance();
        Sanctum::actingAs($tenantUser);

        $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf", ['Accept-Language' => 'en'])
            ->assertOk();

        $this->assertNotNull($this->pilote->html);
        $this->assertStringContainsString('Octobre 2026', $this->pilote->html);
        $this->assertStringNotContainsStringIgnoringCase('october', $this->pilote->html);
    }

    public function test_la_quittance_rendue_en_wolof_porte_le_mois_en_francais_et_rend_la_langue(): void
    {
        [$lease, $payment] = $this->quittance();
        app()->setLocale('wo');

        app(DocumentPdfService::class)->render('pdf.receipts.rent', [
            'lease' => $lease,
            'payment' => $payment,
            'tenant' => $lease->tenant,
            'property' => $lease->property,
            'agency' => null,
        ]);

        $this->assertStringContainsString('Octobre 2026', $this->pilote->html);
        $this->assertStringNotContainsStringIgnoringCase('oktoobar', $this->pilote->html);

        // La langue du lecteur est rendue après le rendu : le reste de la requête la garde.
        $this->assertSame('wo', app()->getLocale());
        $this->assertSame('oktoobar', now()->setDate(2026, 10, 1)->translatedFormat('F'));
    }

    public function test_le_releve_de_gerance_traduit_garde_la_langue_du_lecteur(): void
    {
        app()->setLocale('en');

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
                'payouts' => [],
                'unpaid' => ['count' => 0],
            ],
        ]);

        $this->assertStringContainsString('Management statement', $this->pilote->html);
        $this->assertStringNotContainsString('Relevé de gérance', $this->pilote->html);
    }
}
