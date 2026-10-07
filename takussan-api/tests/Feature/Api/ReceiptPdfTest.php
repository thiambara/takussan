<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-077 — receipt PDF endpoint.
 */
class ReceiptPdfTest extends TestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    public function test_tenant_can_download_own_receipt(): void
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
        ]);

        Sanctum::actingAs($tenantUser);

        $response = $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'), 'Response must be a real PDF binary');
    }

    public function test_other_user_gets_403(): void
    {
        $landlord = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
        ]);

        // An unrelated user
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")
            ->assertForbidden();
    }

    public function test_accepted_collaborator_can_download_receipt(): void
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
        ]);

        $collaboratorUser = User::factory()->create();
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $collaboratorUser->id,
            'role' => CollaboratorRole::Agent,
            'invited_at' => now()->subDay(),
            'accepted_at' => now(),
        ]);

        Sanctum::actingAs($collaboratorUser);

        $response = $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'), 'Response must be a real PDF binary');
    }

    public function test_pending_collaborator_cannot_download_receipt(): void
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

        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
        ]);

        $pendingUser = User::factory()->create();
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $pendingUser->id,
            'role' => CollaboratorRole::Agent,
            'invited_at' => now(),
            'accepted_at' => null,
        ]);

        Sanctum::actingAs($pendingUser);

        $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")
            ->assertForbidden();
    }

    // ─── TCK-593 — pas de quittance pour un impayé, et la pénalité sur sa ligne ──────

    /** AC2 — une échéance `pending` n'a pas de quittance (422) ; la même, payée, en a une. */
    public function test_quittance_refusee_pour_une_echeance_impayee(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Pending, 'late_fee_amount' => null, 'late_fee_applied_at' => null]);
        Sanctum::actingAs($ctx['tenant']);
        $url = "/api/leases/{$ctx['lease']->id}/receipts/{$ctx['payment']->id}/pdf";

        $this->getJson($url)
            ->assertStatus(422)
            ->assertJsonPath('message', __('payments.receipt_unpaid'));

        foreach ([PaymentStatus::Late, PaymentStatus::Failed, PaymentStatus::PartiallyPaid] as $open) {
            $ctx['payment']->forceFill(['status' => $open])->save();
            $this->getJson($url)->assertStatus(422);
        }

        $ctx['payment']->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => now()])->save();
        $response = $this->get($url)->assertOk();
        $this->assertTrue(str_starts_with($response->getContent(), '%PDF-'));
    }

    /**
     * AC5 — loyer payé, pénalité non réglée : la quittance dit « restant due » et « 7 500 » sur la
     * ligne de pénalité, et le loyer acquitté vaut 150 000 — la pénalité ne s'y ajoute pas.
     */
    public function test_quittance_dit_la_penalite_restant_due(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-08 10:00:00']);

        $html = $this->renderedReceipt($ctx);

        $this->assertMatchesRegularExpression('/Pénalité de retard\s*<\/th>\s*<td[^>]*>\s*7 500[^<]*restant due, à régler auprès de l’agence/u', $html);
        $this->assertMatchesRegularExpression('/Loyer acquitté\s*<\/th>\s*<td[^>]*>\s*<strong>150 000/u', $html);
        $this->assertStringNotContainsString('157 500', $html);
        $this->assertStringNotContainsString('Total acquitté', $html);
        $this->assertStringContainsString('Acquitté', $html);
        $this->assertStringContainsString('08/09/2026', $html);
        $this->assertStringNotContainsString('>paid<', $html);
    }

    /** AC6 — pénalité acquittée : « acquittée », et un total acquitté à part de 157 500. */
    public function test_quittance_dit_la_penalite_acquittee(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now(), 'late_fee_paid_at' => now()]);

        $html = $this->renderedReceipt($ctx);

        $this->assertMatchesRegularExpression('/Pénalité de retard\s*<\/th>\s*<td[^>]*>\s*7 500[^<]*acquittée/u', $html);
        $this->assertStringNotContainsString('restant due', $html);
        $this->assertMatchesRegularExpression('/Total acquitté\s*<\/th>\s*<td[^>]*>\s*<strong>157 500/u', $html);
        $this->assertMatchesRegularExpression('/Loyer acquitté\s*<\/th>\s*<td[^>]*>\s*<strong>150 000/u', $html);
    }

    /**
     * Rend la quittance par la VRAIE route (le PDF est produit), et relit le HTML du gabarit à partir
     * des données que la route lui a passées : le texte d'un PDF compressé ne se lit pas.
     * Les espaces insécables du formatage monétaire sont ramenées à l'espace simple.
     *
     * @param  array<string, mixed>  $ctx
     */
    private function renderedReceipt(array $ctx): string
    {
        $captured = null;
        View::composer('pdf.receipts.rent', function ($view) use (&$captured): void {
            $captured = $view->getData();
        });

        Sanctum::actingAs($ctx['tenant']);
        $this->get("/api/leases/{$ctx['lease']->id}/receipts/{$ctx['payment']->id}/pdf")->assertOk();
        $this->assertNotNull($captured, 'Le gabarit de quittance n\'a pas été rendu.');

        $html = view('pdf.receipts.rent', $captured)->render();

        return str_replace(["\u{202F}", "\u{00A0}", '&nbsp;', '&#160;', '&#8239;'], ' ', $html);
    }
}
