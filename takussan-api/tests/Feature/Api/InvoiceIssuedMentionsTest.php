<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P140.03 (TCK-1790) — une facture émise imprime les mentions légales, le destinataire et la
 * désignation du jour de son émission, figés dans `metadata.issued` par `InvoiceNumberAllocator`.
 * Avant, chaque téléchargement relisait l'agence, le client et le bien courants.
 */
class InvoiceIssuedMentionsTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        // Le vrai gabarit, rendu en HTML : le texte imprimé se lit dans la réponse.
        $this->partialMock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(
                fn (string $template, array $data) => view($template, $data)->render()
            );
        });
    }

    public function test_les_mentions_d_emission_survivent_a_un_changement_d_agence_de_client_et_de_bien(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency([
            'legal_name' => 'Alpha SARL', 'ninea' => '111111111', 'rccm' => 'SN-DKR-ALPHA', 'legal_address' => 'Rue Alpha, Dakar',
        ]);
        $customer->forceFill(['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => 'awa.diop@example.test', 'phone' => '+221770000001'])->save();
        $property = Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa Alpha']);
        $lease = Lease::factory()->create(['agency_id' => $agency->id, 'property_id' => $property->id, 'tenant_id' => $customer->id]);
        $invoice = $this->draftOf($agency, $customer);
        $invoice->forceFill(['invoiceable_type' => Lease::class, 'invoiceable_id' => $lease->id])->save();

        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();

        $agency->forceFill(['legal_name' => 'Beta SA', 'ninea' => '222222222', 'rccm' => 'SN-DKR-BETA', 'legal_address' => 'Rue Beta, Thiès'])->save();
        $customer->forceFill(['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'awa.ndiaye@example.test', 'phone' => '+221770000002'])->save();
        $property->forceFill(['title' => 'Villa Beta'])->save();

        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();

        foreach (['Alpha SARL', '111111111', 'SN-DKR-ALPHA', 'Rue Alpha, Dakar', 'Diop', 'awa.diop@example.test', '+221770000001', 'Villa Alpha'] as $emis) {
            $this->assertStringContainsString($emis, $html, "« {$emis} », imprimé à l'émission");
        }
        foreach (['Beta SA', '222222222', 'SN-DKR-BETA', 'Thiès', 'Ndiaye', 'awa.ndiaye@example.test', '+221770000002', 'Villa Beta'] as $courant) {
            $this->assertStringNotContainsString($courant, $html, "« {$courant} », écrit après l'émission");
        }
    }

    public function test_un_brouillon_imprime_les_valeurs_courantes(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency(['legal_name' => 'Alpha SARL']);
        $invoice = $this->draftOf($agency, $customer);
        $agency->forceFill(['legal_name' => 'Beta SA'])->save();

        Sanctum::actingAs($admin);
        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('Beta SA', $html);
        $this->assertArrayNotHasKey('issued', (array) Invoice::query()->findOrFail($invoice->id)->metadata);
    }

    public function test_une_facture_emise_avant_le_gel_imprime_encore_les_valeurs_courantes(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency(['legal_name' => 'Alpha SARL']);
        $invoice = $this->draftOf($agency, $customer);
        // Émise avant TCK-1790 : numérotée, sans `metadata.issued`.
        $invoice->forceFill(['status' => 'sent', 'sequence_year' => 2026, 'sequence_number' => 1, 'reference_number' => 'FA-2026-00001'])->save();
        Customer::query()->whereKey($customer->id)->update(['last_name' => 'Ndiaye']);

        Sanctum::actingAs($admin);
        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();

        $this->assertStringContainsString('Alpha SARL', $html);
        $this->assertStringContainsString('Ndiaye', $html);
    }
}
