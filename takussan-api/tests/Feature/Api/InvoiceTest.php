<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InvoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_user_can_issue_invoice(): void
    {
        $agency = Agency::factory()->create();
        // TCK-528 — `agency_id` seul matérialise un profil OWNER, qui ne porte pas `invoices.create`.
        $agent = User::factory()->withAgentProfile($agency)->create();
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(15)->toDateString(),
            'subtotal' => 500000,
            'tax_rate' => 18,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.subtotal', 500000)
            ->assertJsonPath('data.tax_amount', 90000)
            ->assertJsonPath('data.total_amount', 590000);

        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_creator_can_issue_invoice_for_customer_they_added(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
        ])->assertCreated();
    }

    public function test_random_user_cannot_issue_invoice(): void
    {
        $customer = Customer::factory()->create();

        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
        ])->assertForbidden();
    }

    public function test_issuer_can_send_draft_invoice(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->create(['issued_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/send")
            ->assertOk()
            ->assertJsonPath('data.status', 'sent');
    }

    public function test_cannot_send_non_draft_invoice(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->sent()->create(['issued_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/send")
            ->assertStatus(422);
    }

    public function test_issuer_can_mark_sent_invoice_paid(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->sent()->create(['issued_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/mark-paid")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    /**
     * TCK-593 (passe 2, N4) — une facture réglée à la main le dit (`settled_by = manual`) : le
     * webhook d'un checkout ouvert avant reste un double encaissement, et non « son » règlement.
     */
    public function test_une_facture_reglee_a_la_main_garde_le_checkout_paye_pour_doublon(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->sent()->create([
            'issued_by_id' => $agent->id,
            'transaction_id' => 'inv_txn',
            'metadata' => ['gateway' => [
                'provider' => 'wave',
                'transaction_id' => 'inv_txn',
                'checkout_url' => 'https://pay.example/inv',
                'initiated_at' => now()->subHour()->toIso8601String(),
            ]],
        ]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/invoices/{$invoice->id}/mark-paid")->assertOk();
        $this->assertSame(PaymentGatewayService::SETTLED_MANUALLY, $invoice->refresh()->metadata['gateway']['settled_by']);

        // TCK-293 (ADR-0046 §5) — un événement dit qui l'a authentifié ; ici, la plateforme.
        app(PaymentGatewayService::class)->applyEventToMatchingPayment(
            (new PaymentEvent('wave', PaymentEvent::TYPE_PAID, 'inv_txn', ['amount' => (float) $invoice->total_amount]))
                ->authenticatedBy(WebhookAuthority::platform()),
        );

        $this->assertSame('inv_txn', $invoice->refresh()->metadata['gateway_duplicate_payment'][0]['transaction_id'] ?? null);
    }

    public function test_cannot_cancel_paid_invoice(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->paid()->create(['issued_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/cancel")
            ->assertStatus(422);
    }

    public function test_customer_can_view_own_invoice(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $invoice = Invoice::factory()->create(['customer_id' => $customer->id]);

        Sanctum::actingAs($user);

        $this->getJson("/api/invoices/{$invoice->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $invoice->id);
    }

    public function test_list_is_scoped_to_user(): void
    {
        $agent = User::factory()->create();
        Invoice::factory()->count(3)->create(['issued_by_id' => $agent->id]);
        Invoice::factory()->count(5)->create();

        Sanctum::actingAs($agent);

        $this->getJson('/api/invoices')
            ->assertOk()
            ->assertJsonPath('meta.total', 3);
    }

    public function test_status_filter_applies(): void
    {
        $agent = User::factory()->create();
        Invoice::factory()->count(2)->paid()->create(['issued_by_id' => $agent->id]);
        Invoice::factory()->count(3)->create(['issued_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->getJson('/api/invoices?filter[status]=paid')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_reference_number_auto_generated(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $response = $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
        ]);

        $response->assertCreated();
        $ref = $response->json('data.reference_number');
        $this->assertStringStartsWith('INV-', $ref);
    }

    public function test_invalid_currency_returns_422(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
            'currency' => 'ZZZ',
        ])->assertStatus(422);
    }

    public function test_can_issue_invoice_for_booking(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);
        $booking = Booking::factory()->create();

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
            'invoiceable_type' => 'booking',
            'invoiceable_id' => $booking->id,
        ])->assertCreated()
            ->assertJsonPath('data.invoiceable_type', 'App\Models\Booking')
            ->assertJsonPath('data.invoiceable_id', $booking->id);
    }

    public function test_cannot_issue_invoice_for_invalid_type(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
            'invoiceable_type' => 'invalid_model',
            'invoiceable_id' => 1,
        ])->assertStatus(422);
    }

    public function test_cannot_mark_cancelled_invoice_paid(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->create([
            'issued_by_id' => $agent->id,
            'status' => InvoiceStatus::Cancelled->value,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/mark-paid")->assertStatus(422);
    }

    public function test_can_cancel_draft_invoice(): void
    {
        $agent = User::factory()->create();
        $invoice = Invoice::factory()->create([
            'issued_by_id' => $agent->id,
            'status' => InvoiceStatus::Draft->value,
        ]);

        Sanctum::actingAs($agent);

        $this->postJson("/api/invoices/{$invoice->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_negative_subtotal_returns_422(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => -1000,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['subtotal']);
    }

    public function test_tax_rate_above_100_returns_422(): void
    {
        // TCK-528 — émettre exige `invoices.create` : l'émetteur est un agent (d'une autre agence
        // que le client, qui n'en a pas), et c'est la règle « client ajouté par lui » qui l'admet.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
            'tax_rate' => 150,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['tax_rate']);
    }
}
