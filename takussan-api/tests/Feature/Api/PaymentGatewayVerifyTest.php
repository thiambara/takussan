<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\ApiTestCase;

/**
 * TCK-285 — `GET /api/{paymentType}/{paymentId}/verify`, la vérification
 * FORCÉE auprès du fournisseur.
 *
 * `PaymentGatewayService::verify` (0/14) et `::extractProvider` (0/11) ne
 * s'exécutaient jamais, et la route n'avait aucun test. C'est le chemin
 * qu'un agent emprunte quand un client dit « j'ai payé et vous ne le voyez
 * pas » : il écrit le statut d'un paiement à partir d'une réponse du
 * fournisseur, sans qu'aucun humain ne valide le montant.
 *
 * Le trafic sortant est intercepté par `Http::fake()` — le test ne dépend
 * d'aucun réseau.
 */
class PaymentGatewayVerifyTest extends ApiTestCase
{
    use RefreshDatabase;

    private const TXN = 'cs_wave_verify';

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);

        Integration::factory()->create([
            'agency_id' => $this->agency->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 's'],
        ]);
    }

    // ─── Les trois types de paiement ─────────────────────────────

    public function test_a_successful_verification_marks_a_booking_payment_as_paid(): void
    {
        $this->fakeWave('succeeded');
        $payment = $this->bookingPayment();

        $this->actingAs($this->admin)
            ->getJson("/api/booking-payments/{$payment->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', PaymentStatus::Paid->value)
            ->assertJsonPath('data.provider_status', 'success');

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    public function test_a_successful_verification_marks_a_lease_payment_as_paid(): void
    {
        $this->fakeWave('succeeded');
        $payment = $this->leasePayment();

        $this->actingAs($this->admin)
            ->getJson("/api/lease-payments/{$payment->id}/verify")
            ->assertOk();

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    /**
     * SUSPENDU — la branche `invoices` de la passerelle est morte par
     * SCHÉMA, et de deux façons indépendantes, mesurées le 2026-08-15 :
     *
     *  1. `invoices` n'a AUCUNE colonne `transaction_id` (colonnes réelles
     *     vérifiées par `Schema::getColumnListing`). Or `recordInitiation`
     *     (ligne 333) la remplit et `verify` (ligne 103) la lit : la lecture
     *     rend toujours vide, donc `verify` sort en `null` avant même
     *     d'interroger le fournisseur.
     *  2. `initiate` calcule `(float) $payment->amount` (ligne 81), mais une
     *     `Invoice` porte son montant dans `total_amount`. Le montant vaut
     *     donc 0 et la route rend **422 « Cannot initiate a checkout for a
     *     non-positive amount »** — mesuré.
     *
     * Les routes acceptent pourtant explicitement `invoices`
     * (`routes/api/payments.php:20,24`). Une facture ne peut aujourd'hui ni
     * être payée ni être vérifiée par la passerelle. Ce n'est pas un trou de
     * test : c'est un trou de schéma, et le corriger demande une migration
     * plus une décision sur `amount` vs `total_amount` — hors périmètre d'un
     * ticket de tests. Voir ardoise D-51.
     *
     * La sonde porte sur la CAUSE (la colonne), pas sur le symptôme : le test
     * se rallume seul le jour de la migration.
     */
    public function test_a_successful_verification_marks_an_invoice_as_paid(): void
    {
        if (! Schema::hasColumn('invoices', 'transaction_id')) {
            $this->markTestSkipped(
                'TCK-285 / ardoise D-51 — `invoices` n\'a pas de colonne `transaction_id`, '
                .'et `initiate` lit `amount` là où une facture porte `total_amount` (422 mesuré). '
                .'La branche `invoices` de la passerelle de paiement est morte par schéma.',
            );
        }

        $this->fakeWave('succeeded');
        $invoice = $this->invoice();

        $this->actingAs($this->admin)
            ->getJson("/api/invoices/{$invoice->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', 'success');
    }

    // ─── Les chemins d'échec ─────────────────────────────────────

    public function test_a_failed_verification_does_not_mark_the_payment_as_paid(): void
    {
        $this->fakeWave('failed');
        $payment = $this->bookingPayment();

        $this->actingAs($this->admin)
            ->getJson("/api/booking-payments/{$payment->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', 'failed');

        $this->assertNotSame(PaymentStatus::Paid, $payment->refresh()->status);
    }

    public function test_a_payment_without_a_transaction_id_is_not_verified_at_all(): void
    {
        // Sans identifiant de transaction il n'y a rien à interroger : le
        // service doit rendre null SANS toucher au paiement et SANS appeler
        // le fournisseur. Appeler avec un identifiant vide interrogerait
        // l'URL de collection du fournisseur — une réponse arbitraire
        // pourrait alors marquer le paiement payé.
        Http::fake();
        $payment = $this->bookingPayment(['transaction_id' => null, 'metadata' => []]);

        $this->actingAs($this->admin)
            ->getJson("/api/booking-payments/{$payment->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', null);

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        Http::assertNothingSent();
    }

    public function test_a_payment_without_any_integration_is_not_verified(): void
    {
        Http::fake();
        Integration::query()->delete();
        $payment = $this->bookingPayment();

        $this->actingAs($this->admin)
            ->getJson("/api/booking-payments/{$payment->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.provider_status', null);

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        Http::assertNothingSent();
    }

    // ─── Autorisation ────────────────────────────────────────────

    public function test_the_admin_of_another_agency_cannot_force_a_verification(): void
    {
        // Forcer une vérification écrit un statut de paiement : c'est une
        // mutation, et elle doit rester dans les murs de l'agence.
        $this->fakeWave('succeeded');
        $payment = $this->bookingPayment();

        $otherAgency = Agency::factory()->create();
        $intruder = User::factory()->create(['agency_id' => $otherAgency->id]);

        $this->actingAs($intruder)
            ->getJson("/api/booking-payments/{$payment->id}/verify")
            ->assertForbidden();

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
        Http::assertNothingSent();
    }

    public function test_an_unauthenticated_caller_is_rejected(): void
    {
        $this->fakeWave('succeeded');
        $payment = $this->bookingPayment();

        $this->getJson("/api/booking-payments/{$payment->id}/verify")->assertUnauthorized();

        $this->assertSame(PaymentStatus::Pending, $payment->refresh()->status);
    }

    public function test_an_unknown_payment_type_is_a_404(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/widgets/1/verify')
            ->assertNotFound();
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function fakeWave(string $status): void
    {
        Http::fake([
            '*/v1/checkout/sessions/*' => Http::response([
                'id' => self::TXN,
                'payment_status' => $status,
            ], 200),
        ]);
    }

    /** @param array<string,mixed> $attributes */
    private function bookingPayment(array $attributes = []): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'agency_id' => $this->agency->id,
            'currency' => Currency::XOF,
        ]);

        return BookingPayment::factory()->create(array_merge([
            'booking_id' => $booking->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => self::TXN,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => self::TXN]],
        ], $attributes));
    }

    private function leasePayment(): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'amount' => 50000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Pending,
            'transaction_id' => self::TXN,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => self::TXN]],
        ]);
    }

    private function invoice(): Invoice
    {
        return Invoice::factory()->create([
            'agency_id' => $this->agency->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'subtotal' => 50000,
            'total_amount' => 50000,
            'currency' => Currency::XOF,
            'metadata' => ['gateway' => ['provider' => 'wave', 'transaction_id' => self::TXN]],
        ]);
    }
}
