<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P130.06 (TCK-1334) — la facture et la quittance attestent un fait passé : elles impriment le
 * client que la fiche désignait alors, même supprimée depuis (suppression douce). Avant, la facture
 * imprimait « — » et la quittance un nom vide.
 */
class PdfDUnClientSupprimeTest extends TestCase
{
    use RefreshDatabase;

    /** Le HTML que le gabarit a rendu pour la requête, capturé au passage de la vue. */
    private function rendered(string $view, string $uri, User $actor): string
    {
        $captured = null;
        View::composer($view, function ($v) use (&$captured): void {
            $captured = $v->getData();
        });

        Sanctum::actingAs($actor);
        $this->get($uri)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertNotNull($captured, "Le gabarit {$view} n'a pas été rendu.");

        return view($view, $captured)->render();
    }

    public function test_la_facture_d_un_client_supprime_imprime_son_nom(): void
    {
        $issuer = User::factory()->create();
        $customer = Customer::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Ndiayefacture',
            'email' => 'awa.facture@example.test',
        ]);
        $invoice = Invoice::factory()->sent()->create([
            'customer_id' => $customer->id,
            'issued_by_id' => $issuer->id,
        ]);
        $customer->delete();

        $html = $this->rendered('pdf.invoices.default', "/api/invoices/{$invoice->id}/pdf", $issuer);

        $this->assertStringContainsString('Awa Ndiayefacture', $html);
        $this->assertStringContainsString('awa.facture@example.test', $html);
    }

    public function test_la_quittance_d_un_locataire_supprime_imprime_son_nom(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create([
            'first_name' => 'Moussa',
            'last_name' => 'Sarrquittance',
        ]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
        ]);
        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 400_000,
        ]);
        $tenant->delete();

        $html = $this->rendered('pdf.receipts.rent', "/api/leases/{$lease->id}/receipts/{$payment->id}/pdf", $landlord);

        $this->assertStringContainsString('Moussa Sarrquittance', $html);
    }
}
