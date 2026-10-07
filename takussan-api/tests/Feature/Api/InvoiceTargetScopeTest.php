<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Invoice;
use App\Models\Lease;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC22) — une facture ne cible qu'un bail ou une réservation de son agence.
 */
class InvoiceTargetScopeTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac22_a_lease_of_another_agency_is_refused_and_nothing_is_written(): void
    {
        [$agency, $admin, $customer] = $this->invoicingAgency();
        $foreign = Lease::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $own = Lease::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($admin);
        $body = ['customer_id' => $customer->id, 'issue_date' => '2026-10-07', 'subtotal' => 100_000, 'invoiceable_type' => 'lease'];

        $this->postJson('/api/invoices', $body + ['invoiceable_id' => $foreign->id])
            ->assertStatus(422)
            ->assertJsonPath('message', __('money_out.invoice.foreign_target'));
        $this->assertSame(0, Invoice::query()->count());

        $this->postJson('/api/invoices', $body + ['invoiceable_id' => $own->id])->assertCreated();
    }
}
