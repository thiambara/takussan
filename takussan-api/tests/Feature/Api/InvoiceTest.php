<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InvoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_user_can_issue_invoice(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
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
        $agent = User::factory()->create();
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

        $this->getJson('/api/invoices?status=paid')
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_reference_number_auto_generated(): void
    {
        $agent = User::factory()->create();
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
        $agent = User::factory()->create();
        $customer = Customer::factory()->create(['added_by_id' => $agent->id]);

        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', [
            'customer_id' => $customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
            'currency' => 'ZZZ',
        ])->assertStatus(422);
    }
}
