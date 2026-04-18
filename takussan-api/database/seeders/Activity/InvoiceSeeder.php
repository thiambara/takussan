<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class InvoiceSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        // Only generate invoices for active/terminated leases (not drafts).
        foreach ($this->ctx->leases as $lease) {
            if (in_array($lease->status, [LeaseStatus::Draft, LeaseStatus::Renewed], true)) {
                continue;
            }

            $this->seedLeaseInvoices($lease);
        }
    }

    private function seedLeaseInvoices(Lease $lease): void
    {
        $start = CarbonImmutable::parse($lease->start_date)->startOfMonth();
        $end = $lease->status === LeaseStatus::Terminated && $lease->terminated_at
            ? CarbonImmutable::parse($lease->terminated_at)->startOfMonth()
            : (Timeline::seedEnd()->lessThan(CarbonImmutable::parse($lease->end_date))
                ? Timeline::seedEnd()->startOfMonth()
                : CarbonImmutable::parse($lease->end_date)->startOfMonth());

        $cursor = $start;
        while ($cursor->lessThanOrEqualTo($end)) {
            Invoice::withoutEvents(function () use ($lease, $cursor) {
                Invoice::create([
                    'invoiceable_id' => $lease->id,
                    'invoiceable_type' => Lease::class,
                    'customer_id' => $lease->tenant_id,
                    'issued_by_id' => null,
                    'agency_id' => $lease->agency_id,
                    'reference_number' => 'INV-'.strtoupper(Str::random(8)),
                    'status' => $cursor->lessThan(Timeline::seedEnd())
                        ? InvoiceStatus::Paid->value
                        : InvoiceStatus::Sent->value,
                    'issue_date' => $cursor->toDateString(),
                    'due_date' => $cursor->addDays(15)->toDateString(),
                    'subtotal' => $lease->monthly_rent,
                    'tax_rate' => 0,
                    'tax_amount' => 0,
                    'total_amount' => $lease->monthly_rent,
                    'currency' => 'XOF',
                    'created_at' => $cursor,
                    'updated_at' => $cursor,
                ]);
            });

            $cursor = $cursor->addMonth();
        }
    }
}
