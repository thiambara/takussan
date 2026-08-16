<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-285 — `GET /api/agencies/{agency}/bank-statements/payment-search`.
 *
 * `PaymentSearchService` était à 0/62 lignes, ses 5 méthodes muettes, et la
 * route n'avait aucun test. C'est la liste dans laquelle un comptable choisit
 * à la main le paiement qu'il va rapprocher : y voir apparaître le paiement
 * d'une autre agence, c'est lui donner les moyens de rapprocher l'argent d'un
 * tiers — et le montant, la référence et le NOM DU PAYEUR fuitent au passage,
 * même si le rapprochement est ensuite refusé par `ReconciliationManager`.
 *
 * Le refus d'accès à la route pour une autre agence est couvert par
 * {@see BankReconciliationCrossAgencyTest} ; ici on éprouve le CONTENU rendu
 * à un appelant parfaitement légitime.
 */
class PaymentSearchTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Agency $other;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);

        $this->other = Agency::factory()->create(['currency' => Currency::XOF]);
    }

    public function test_the_three_payment_types_are_searchable(): void
    {
        $lease = $this->leasePayment($this->agency, 'MATCH-LEASE', 15000);
        $booking = $this->bookingPayment($this->agency, 'MATCH-BOOKING', 15000);
        $invoice = $this->invoice($this->agency, 'MATCH-INVOICE', 15000);

        $body = $this->search('MATCH-');

        $this->assertEqualsCanonicalizing(
            ['lease_payment', 'booking_payment', 'invoice'],
            array_column($body, 'type'),
        );
        $this->assertEqualsCanonicalizing(
            [$lease->id, $booking->id, $invoice->id],
            array_column($body, 'id'),
        );
    }

    public function test_a_payment_of_another_agency_never_appears_in_the_results(): void
    {
        // Même référence, même montant : seule l'agence diffère. C'est le cas
        // qui fuit si un `whereHas` de portée saute.
        $mine = $this->leasePayment($this->agency, 'SHARED-REF', 15000);
        $this->leasePayment($this->other, 'SHARED-REF', 15000);
        $this->bookingPayment($this->other, 'SHARED-REF', 15000);
        $this->invoice($this->other, 'SHARED-REF', 15000);

        $body = $this->search('SHARED-REF');

        $this->assertCount(1, $body);
        $this->assertSame($mine->id, $body[0]['id']);
        $this->assertSame('lease_payment', $body[0]['type']);
    }

    public function test_an_already_reconciled_payment_is_excluded(): void
    {
        // Déjà rapproché ailleurs : le proposer inviterait à un double
        // rapprochement du même encaissement.
        $this->leasePayment($this->agency, 'DONE-REF', 15000, ['bank_reconciled_at' => now()]);

        $this->assertSame([], $this->search('DONE-REF'));
    }

    public function test_the_amount_hint_filters_out_distant_amounts(): void
    {
        $exact = $this->leasePayment($this->agency, 'AMT-A', 15000);
        $this->leasePayment($this->agency, 'AMT-B', 99000);

        $body = $this->search('AMT-', 15000);

        $this->assertCount(1, $body);
        $this->assertSame($exact->id, $body[0]['id']);
    }

    public function test_an_empty_query_lists_the_agency_payments_without_leaking_others(): void
    {
        // `q=''` est un chemin distinct dans `applySearch` : le filtre de
        // texte est sauté, et il ne reste QUE la portée d'agence.
        $mine = $this->leasePayment($this->agency, 'MINE', 15000);
        $this->leasePayment($this->other, 'THEIRS', 15000);

        $body = $this->search('');

        $this->assertCount(1, $body);
        $this->assertSame($mine->id, $body[0]['id']);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** @return array<int,array<string,mixed>> */
    private function search(string $query, ?int $amount = null): array
    {
        $url = "/api/agencies/{$this->agency->id}/bank-statements/payment-search?q=".urlencode($query);
        if ($amount !== null) {
            $url .= "&amount={$amount}";
        }

        $response = $this->actingAs($this->admin)->getJson($url);
        $response->assertOk();

        return $response->json('data');
    }

    /** @param array<string,mixed> $attributes */
    private function leasePayment(Agency $agency, string $reference, int $amount, array $attributes = []): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        return LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'reference_number' => $reference,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
        ], $attributes));
    }

    private function bookingPayment(Agency $agency, string $reference, int $amount): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'reference_number' => $reference,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
        ]);
    }

    private function invoice(Agency $agency, string $reference, int $amount): Invoice
    {
        return Invoice::factory()->create([
            'agency_id' => $agency->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'reference_number' => $reference,
            'subtotal' => $amount,
            'total_amount' => $amount,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
        ]);
    }
}
