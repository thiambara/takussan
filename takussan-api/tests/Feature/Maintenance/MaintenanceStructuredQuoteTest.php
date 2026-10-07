<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC15 (P12) : un devis structuré, un montant calculé, une devise imposée, une validité.
 *
 * Avant : un `amount` unique saisi librement et une devise libre (« XOF, EUR... »).
 */
class MaintenanceStructuredQuoteTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /**
     * verif-592, mineur 1 (sonde v06) — XOF n'a pas de sous-unité : chaque ligne puis le total
     * s'arrondissent à l'unité, au plus proche, la moitié vers le haut. 1,5 × 333,33 = 499,995 →
     * 500 (la troncature rendait 499,99).
     */
    public function test_xof_lines_and_total_are_rounded_to_the_unit(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", [
            'lines' => [
                ['label' => 'Tuyau', 'kind' => 'supply', 'quantity' => '1.5', 'unit_price' => '333.33'],
                ['label' => 'Collier', 'kind' => 'supply', 'quantity' => '0.5', 'unit_price' => '1.01'],
                ['label' => 'Joint', 'kind' => 'supply', 'quantity' => '1', 'unit_price' => '0.49'],
            ],
            'valid_until' => now()->addWeek()->toDateString(),
        ])->assertOk();

        $mr->refresh();
        $this->assertSame('XOF', $mr->quote_currency);
        $this->assertSame('500.00', $mr->quote_lines[0]['total']);
        $this->assertSame('1.00', $mr->quote_lines[1]['total']);
        $this->assertSame('0.00', $mr->quote_lines[2]['total']);
        $this->assertSame('501.00', (string) $mr->quote_amount);
    }

    /** Une devise à sous-unité garde ses 2 décimales, arrondies et non tronquées. */
    public function test_a_currency_with_cents_is_rounded_to_the_cent(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $agency->forceFill(['currency' => 'EUR'])->save();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", [
            'lines' => [['label' => 'Tuyau', 'kind' => 'supply', 'quantity' => '1.5', 'unit_price' => '10.01']],
            'valid_until' => now()->addWeek()->toDateString(),
        ])->assertOk();

        $mr->refresh();
        $this->assertSame('EUR', $mr->quote_currency);
        $this->assertSame('15.02', $mr->quote_lines[0]['total']);
        $this->assertSame('15.02', (string) $mr->quote_amount);
    }

    public function test_amount_is_computed_from_the_lines(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", [
            'lines' => [
                ['label' => 'Pose', 'kind' => 'labour', 'quantity' => 2, 'unit_price' => 7500],
                ['label' => 'Robinet', 'kind' => 'supply', 'quantity' => 1, 'unit_price' => '12000'],
            ],
            'valid_until' => now()->addDays(10)->toDateString(),
            'estimated_duration_days' => 2,
        ])->assertOk();

        $mr->refresh();
        $this->assertSame('27000.00', (string) $mr->quote_amount);
        $this->assertSame('XOF', $mr->quote_currency);
        $this->assertSame('15000.00', $mr->quote_lines[0]['total']);
        $this->assertSame('7500.00', $mr->quote_lines[0]['unit_price']);
        $this->assertSame(2, $mr->quote_estimated_duration_days);

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonPath('data.quote_amount', 27000)
            ->assertJsonPath('data.quote_lines.1.kind', 'supply')
            ->assertJsonPath('data.quote_valid_until', now()->addDays(10)->toDateString());
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function refusedBodies(): array
    {
        return [
            'devise envoyée' => [['currency' => 'EUR'], 'currency'],
            'montant envoyé' => [['amount' => 1], 'amount'],
            'sans ligne' => [['lines' => []], 'lines'],
            'nature inconnue' => [['lines' => [['label' => 'x', 'kind' => 'other', 'quantity' => 1, 'unit_price' => 1]]], 'lines.0.kind'],
            'validité passée' => [['valid_until' => '2020-01-01'], 'valid_until'],
        ];
    }

    /** @param  array<string, mixed>  $override */
    #[DataProvider('refusedBodies')]
    public function test_invalid_bodies_are_refused(array $override, string $field): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(25000, $override))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertSame(MaintenanceStatus::QuoteRequested, $mr->refresh()->status);
    }

    public function test_expired_quote_cannot_be_approved(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 25000,
            'quote_submitted_at' => now()->subDays(10),
            'quote_valid_until' => now()->subDay()->toDateString(),
        ]);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")
            ->assertUnprocessable()
            ->assertJsonPath('message', __('maintenance.errors.quote_expired'));

        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    /** Témoin : valable aujourd'hui encore → approuvé. */
    public function test_quote_valid_today_is_approved(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 25000,
            'quote_valid_until' => now()->toDateString(),
        ]);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    }

    /** Le PDF passe par le service PDF commun, avec le gabarit du devis ; le locataire n'y a pas accès. */
    public function test_quote_pdf_uses_the_shared_service_and_is_closed_to_the_tenant(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 27000,
            'quote_currency' => 'XOF',
            'quote_submitted_at' => now(),
            'quote_lines' => [['label' => 'Pose', 'kind' => 'labour', 'quantity' => '1.00', 'unit_price' => '27000.00', 'total' => '27000.00']],
        ]);

        $seen = [];
        $service = Mockery::mock(DocumentPdfService::class);
        $service->shouldReceive('stream')->once()->andReturnUsing(function (string $template, array $data) use (&$seen) {
            $seen = ['template' => $template, 'data' => $data];

            return response('%PDF-1.4 simulé', 200, ['Content-Type' => 'application/pdf']);
        });
        $this->app->instance(DocumentPdfService::class, $service);

        Sanctum::actingAs($tenant);
        $this->get("/api/maintenance-requests/{$mr->id}/quote/pdf")->assertForbidden();

        Sanctum::actingAs($provider);
        $this->get("/api/maintenance-requests/{$mr->id}/quote/pdf")->assertOk();
        $this->assertSame('pdf.maintenance.quote', $seen['template']);
        $this->assertSame(27000.0, $seen['data']['amount']);
        $this->assertCount(1, $seen['data']['lines']);
    }

    /** Le gabarit se rend réellement (Blade), sans moteur PDF : chaque libellé vient des clés. */
    public function test_quote_template_renders_in_the_reader_language(): void
    {
        ['mr' => $mr] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 27000,
            'quote_submitted_at' => now(),
            'quote_lines' => [['label' => 'Pose', 'kind' => 'supply', 'quantity' => '2.00', 'unit_price' => '7500.00', 'total' => '15000.00']],
        ]);

        $html = view('pdf.maintenance.quote', [
            'mr' => $mr, 'lines' => $mr->quote_lines, 'amount' => 27000.0, 'currency' => 'XOF',
            'property' => $mr->property, 'provider' => $mr->assignee, 'agency' => null, 'locale' => 'wo',
            'title' => 'x', 'document_label' => 'x', 'agency_logo_url' => null, 'generated_at' => now(),
        ])->render();

        $this->assertStringContainsString(__('maintenance.quote_pdf.kinds.supply', [], 'wo'), $html);
        $this->assertStringContainsString(__('maintenance.quote_pdf.total', [], 'wo'), $html);
    }
}
