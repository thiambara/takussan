<?php

namespace Tests\Concerns;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;

/**
 * TCK-594 — une agence vérifiée, son admin, un client de l'agence, et des brouillons.
 */
trait BuildsInvoices
{
    /** @return array{0: Agency, 1: User, 2: Customer} */
    protected function invoicingAgency(array $attributes = []): array
    {
        $agency = Agency::factory()->create(array_merge(['is_verified' => true], $attributes));
        $admin = $this->agencyAdmin($agency);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        return [$agency, $admin, $customer];
    }

    protected function draftOf(Agency $agency, Customer $customer, float $total = 100_000): Invoice
    {
        return Invoice::factory()->create([
            'agency_id' => $agency->id,
            'customer_id' => $customer->id,
            'status' => InvoiceStatus::Draft,
            'subtotal' => $total,
            'tax_rate' => 0,
            'tax_amount' => 0,
            'total_amount' => $total,
        ]);
    }
}
