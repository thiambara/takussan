<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Invoice;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * P235.01 (TCK-2369) — la ligne « Client » d'une facture dont la fiche n'a pas de nom (compte créé
 * par téléphone, TCK-2281) porte le numéro de la fiche, à défaut son e-mail. Avant, le repli
 * `$customer->name` ne lisait aucune colonne : `metadata.issued.customer.name` valait `null`, et le
 * PDF imprimait « — ». Une facture déjà émise garde ses mentions figées.
 */
class DestinataireSansNomDeLaFactureTest extends TestCase
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

    public function test_l_emission_nomme_une_fiche_sans_nom_par_son_numero(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        $customer->forceFill(['first_name' => '', 'last_name' => '', 'email' => 'sans.nom@example.test', 'phone' => '+221770000623'])->save();
        $invoice = $this->draftOf($customer->agency, $customer);

        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();

        $this->assertSame('+221770000623', Invoice::query()->findOrFail($invoice->id)->metadata['issued']['customer']['name']);
        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();
        $this->assertMatchesRegularExpression('#<th>Client</th>\s*<td>\+221770000623</td>#', $html);
    }

    public function test_l_emission_nomme_une_fiche_sans_nom_ni_numero_par_son_e_mail(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        $customer->forceFill(['first_name' => '', 'last_name' => '', 'email' => 'sans.nom@example.test', 'phone' => null])->save();
        $invoice = $this->draftOf($customer->agency, $customer);

        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();

        $this->assertSame('sans.nom@example.test', Invoice::query()->findOrFail($invoice->id)->metadata['issued']['customer']['name']);
    }

    public function test_une_fiche_nommee_garde_son_nom(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        $customer->forceFill(['first_name' => 'Awa', 'last_name' => 'Diop', 'phone' => '+221770000624'])->save();
        $invoice = $this->draftOf($customer->agency, $customer);

        Sanctum::actingAs($admin);
        $this->postJson("/api/invoices/{$invoice->id}/send")->assertOk();

        $this->assertSame('Awa Diop', Invoice::query()->findOrFail($invoice->id)->metadata['issued']['customer']['name']);
    }

    public function test_le_brouillon_d_une_fiche_sans_nom_imprime_son_numero(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        $customer->forceFill(['first_name' => '', 'last_name' => '', 'phone' => '+221770000625'])->save();
        $invoice = $this->draftOf($customer->agency, $customer);

        Sanctum::actingAs($admin);
        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();

        $this->assertMatchesRegularExpression('#<th>Client</th>\s*<td>\+221770000625</td>#', $html);
    }

    /** Épingle : les mentions figées d'une facture émise ne sont pas réécrites. */
    public function test_une_facture_deja_emise_sans_nom_garde_son_tiret(): void
    {
        [, $admin, $customer] = $this->invoicingAgency();
        $customer->forceFill(['first_name' => '', 'last_name' => '', 'phone' => '+221770000626'])->save();
        $invoice = $this->draftOf($customer->agency, $customer);
        $invoice->forceFill([
            'status' => 'sent', 'sequence_year' => 2026, 'sequence_number' => 1, 'reference_number' => 'FA-2026-00001',
            'metadata' => ['issued' => ['agency' => [], 'customer' => ['name' => null, 'email' => null, 'phone' => '+221770000626'], 'designation' => null]],
        ])->save();
        Customer::query()->whereKey($customer->id)->update(['first_name' => 'Awa']);

        Sanctum::actingAs($admin);
        $html = (string) $this->get("/api/invoices/{$invoice->id}/pdf")->assertOk()->getContent();

        $this->assertMatchesRegularExpression('#<th>Client</th>\s*<td>—</td>#', $html);
        $this->assertStringNotContainsString('Awa', $html);
    }
}
