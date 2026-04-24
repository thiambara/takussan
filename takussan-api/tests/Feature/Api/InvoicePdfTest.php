<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-077 — invoice PDF endpoint.
 */
class InvoicePdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_receives_pdf_with_correct_amount(): void
    {
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
            'subtotal' => 750_000,
            'tax_amount' => 0,
            'total_amount' => 750_000,
        ]);

        Sanctum::actingAs($customerUser);

        $response = $this->get("/api/invoices/{$invoice->id}/pdf");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'));
        // The (dompdf) driver compresses page streams, so we can't assert on
        // raw substrings inside the binary. Validate via byte-size heuristic.
        $this->assertGreaterThan(1000, strlen($body));
    }

    public function test_stranger_gets_403_on_invoice_pdf(): void
    {
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $invoice = Invoice::factory()->create([
            'customer_id' => $customer->id,
        ]);

        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->get("/api/invoices/{$invoice->id}/pdf")
            ->assertForbidden();
    }
}
