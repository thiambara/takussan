<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsInvoices;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2156 (P200.03 et P200.04, décisions du porteur du 2026-10-24) — une facture ne se dresse ni
 * sur une réservation `cancelled`, `rejected` ou `expired`, ni sur un bail `draft` ou
 * `pending_signature` (422 `invoice.target_not_billable`) ; et son destinataire est le client de la
 * réservation ou le locataire du bail (422 `invoice.recipient_mismatch`).
 *
 * Avant : seule l'agence de l'objet était jugée — 201 sur une réservation annulée, sur un bail en
 * brouillon, et pour un autre client que celui de la réservation.
 */
class InvoiceTargetStatusAndRecipientTest extends TestCase
{
    use BuildsInvoices;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        [$this->agency, $this->admin, $this->customer] = $this->invoicingAgency();
        Sanctum::actingAs($this->admin);
    }

    public function test_a_closed_booking_is_not_billable(): void
    {
        foreach ([BookingStatus::Cancelled, BookingStatus::Rejected, BookingStatus::Expired] as $status) {
            $booking = $this->booking($status);

            $this->invoice('booking', $booking->id)
                ->assertStatus(422)
                ->assertJsonPath('code', 'invoice.target_not_billable');
        }
        $this->assertSame(0, Invoice::query()->count());
    }

    public function test_a_lease_not_yet_signed_is_not_billable(): void
    {
        foreach ([LeaseStatus::Draft, LeaseStatus::PendingSignature] as $status) {
            $lease = $this->lease($status);

            $this->invoice('lease', $lease->id)
                ->assertStatus(422)
                ->assertJsonPath('code', 'invoice.target_not_billable');
        }
        $this->assertSame(0, Invoice::query()->count());
    }

    public function test_open_bookings_and_running_or_ended_leases_stay_billable(): void
    {
        foreach ([BookingStatus::Pending, BookingStatus::Confirmed, BookingStatus::Completed] as $status) {
            $this->invoice('booking', $this->booking($status)->id)->assertCreated();
        }
        foreach ([LeaseStatus::Active, LeaseStatus::Terminated, LeaseStatus::Expired] as $status) {
            $this->invoice('lease', $this->lease($status)->id)->assertCreated();
        }
    }

    public function test_the_recipient_must_be_the_customer_of_the_booking(): void
    {
        $other = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $booking = $this->booking(BookingStatus::Confirmed, $other);

        $this->invoice('booking', $booking->id)
            ->assertStatus(422)
            ->assertJsonPath('code', 'invoice.recipient_mismatch');
        $this->assertSame(0, Invoice::query()->count());
    }

    public function test_the_recipient_must_be_the_tenant_of_the_lease(): void
    {
        $other = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $lease = $this->lease(LeaseStatus::Active, $other);

        $this->invoice('lease', $lease->id)
            ->assertStatus(422)
            ->assertJsonPath('code', 'invoice.recipient_mismatch');
        $this->assertSame(0, Invoice::query()->count());
    }

    /** Témoin : une facture sans objet se dresse à tout client de l'agence. */
    public function test_an_invoice_without_target_is_unchanged(): void
    {
        $this->postJson('/api/invoices', [
            'customer_id' => $this->customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100_000,
        ])->assertCreated();
    }

    private function invoice(string $type, int $id): TestResponse
    {
        return $this->postJson('/api/invoices', [
            'customer_id' => $this->customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100_000,
            'invoiceable_type' => $type,
            'invoiceable_id' => $id,
        ]);
    }

    private function booking(BookingStatus $status, ?Customer $customer = null): Booking
    {
        return Booking::factory()->create([
            'agency_id' => $this->agency->id,
            'customer_id' => ($customer ?? $this->customer)->id,
            'status' => $status,
        ]);
    }

    private function lease(LeaseStatus $status, ?Customer $tenant = null): Lease
    {
        return Lease::factory()->create([
            'agency_id' => $this->agency->id,
            'tenant_id' => ($tenant ?? $this->customer)->id,
            'status' => $status,
        ]);
    }
}
