<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Services\Model\BookingPaymentService;
use App\Services\Payments\PaymentReceiptPdf;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2892 (ADR-0110 § 1, AC3) — deux types de paiement de réservation : `security_deposit` (la
 * caution d'un séjour) et `other` (qui dit ce qu'il est dans `notes`, exigé).
 *
 * Ni l'un ni l'autre ne règle le total du séjour : ils ne sont pas bornés par le reste dû
 * (`booking_payment.exceeds_remaining` ne bornait que ce qui n'était pas `fee`) et ne réduisent
 * pas ce que le client doit encore. Le reçu PDF les NOMME (« Caution », « Autre »).
 */
class BookingPaymentTypesTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
        $this->booking = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'total_amount' => 100_000,
            'deposit_amount' => 30_000,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function record(int $amount, string $type, array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson("/api/bookings/{$this->booking->id}/payments", [
            'amount' => $amount,
            'payment_type' => $type,
            'payment_method' => 'cash',
        ] + $extra);
    }

    public function test_une_caution_est_encaissee(): void
    {
        $this->record(50_000, 'security_deposit')
            ->assertCreated()
            ->assertJsonPath('data.payment_type', 'security_deposit')
            ->assertJsonPath('data.amount', 50000);

        $this->assertSame(BookingPaymentType::SecurityDeposit, $this->booking->payments()->sole()->payment_type);
    }

    public function test_un_paiement_autre_exige_sa_note(): void
    {
        $this->record(5_000, 'other')->assertUnprocessable()->assertJsonValidationErrors('notes');
        $this->record(5_000, 'other', ['notes' => ''])->assertUnprocessable()->assertJsonValidationErrors('notes');
        $this->assertSame(0, $this->booking->payments()->count());

        $this->record(5_000, 'other', ['notes' => 'Ménage de fin de séjour'])
            ->assertCreated()
            ->assertJsonPath('data.payment_type', 'other');
    }

    public function test_une_caution_n_est_pas_bornee_par_le_reste_du_ni_ne_le_reduit(): void
    {
        // Le séjour est réglé en entier : rien ne reste à encaisser sur son total.
        $this->record(100_000, 'advance')->assertCreated();
        $this->record(1, 'advance')->assertStatus(422)->assertJsonPath('code', 'booking_payment.exceeds_remaining');

        // La caution ne règle pas le total : elle s'encaisse encore.
        $this->record(50_000, 'security_deposit')->assertCreated();
        $this->record(5_000, 'other', ['notes' => 'Clé perdue'])->assertCreated();

        // Et elle ne réduit ni le reste reversable, ni ce que le client doit encore.
        $nouveau = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'total_amount' => 100_000, 'deposit_amount' => 30_000]);
        BookingPayment::factory()->paid()->create(['booking_id' => $nouveau->id, 'amount' => 50_000, 'payment_type' => BookingPaymentType::SecurityDeposit]);
        BookingPayment::factory()->paid()->create(['booking_id' => $nouveau->id, 'amount' => 5_000, 'payment_type' => BookingPaymentType::Other]);
        $service = $this->app->make(BookingPaymentService::class);
        $this->assertSame(100_000.0, $service->remainingReversable($nouveau));
        $this->assertSame([30_000.0, BookingPaymentType::Deposit->value], $service->dueFromCustomer($nouveau));
    }

    public function test_le_recu_nomme_les_deux_types(): void
    {
        $rendus = [];
        $service = Mockery::mock(DocumentPdfService::class);
        $service->shouldReceive('render')->andReturnUsing(function (string $template, array $data) use (&$rendus) {
            $rendus[] = view($template, $data)->render();

            return '%PDF-1.4';
        });
        $this->app->instance(DocumentPdfService::class, $service);

        foreach ([BookingPaymentType::SecurityDeposit, BookingPaymentType::Other] as $type) {
            $paiement = BookingPayment::factory()->paid()->create(['booking_id' => $this->booking->id, 'payment_type' => $type, 'notes' => 'x']);
            $this->app->make(PaymentReceiptPdf::class)->forBookingPayment($paiement);
        }

        $this->assertStringContainsString('<td>Caution</td>', $rendus[0]);
        $this->assertStringContainsString('<td>Autre</td>', $rendus[1]);
        $this->assertStringNotContainsString('security_deposit', $rendus[0]);
    }
}
