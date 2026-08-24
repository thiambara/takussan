<?php

namespace Tests\Feature\Services;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\User;
use App\Services\Payments\PaymentReceiptPdf;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * TCK-354 — la quittance de réservation passe par le service central, et par le gabarit
 * du système partagé.
 *
 * ⚠ **Ce que les tests existants ne pouvaient PAS attraper.**
 * `BookingPaymentTest::test_customer_can_download_paid_booking_payment_receipt_pdf` vérifie que
 * la route rend des octets commençant par `%PDF-`. C'est vrai du service central comme de
 * l'ancien `new Dompdf(…)`, et vrai de n'importe quel gabarit. Un retour en arrière — sur le
 * moteur ou sur le gabarit — laisserait ce test VERT.
 *
 * D'où une assertion sur la DÉCISION elle-même : quel gabarit, par quel service. C'est la seule
 * forme qu'une régression ne peut pas cocher au passage.
 */
class PaymentReceiptPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_receipt_is_rendered_by_the_central_service_from_the_shared_template(): void
    {
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $customerUser->id]);
        $booking = Booking::factory()->create(['customer_id' => $customer->id]);
        $payment = BookingPayment::factory()->paid()->create([
            'booking_id' => $booking->id,
            'amount' => 125_000,
        ]);

        $vu = [];
        $service = Mockery::mock(DocumentPdfService::class);
        $service->shouldReceive('render')
            ->once()
            ->andReturnUsing(function (string $template, array $data) use (&$vu) {
                $vu = ['template' => $template, 'data' => $data];

                return '%PDF-1.4 rendu simulé';
            });
        $this->app->instance(DocumentPdfService::class, $service);

        $octets = $this->app->make(PaymentReceiptPdf::class)->forBookingPayment($payment);

        $this->assertSame('%PDF-1.4 rendu simulé', $octets);
        $this->assertSame('pdf.receipts.booking', $vu['template']);

        // Le gabarit partagé lit ces clés-là ; les perdre rendrait un document muet plutôt
        // qu'une erreur, ce qui est le mode de défaillance le plus coûteux pour un document.
        foreach (['reference', 'amount', 'currency', 'context_label', 'agency'] as $cle) {
            $this->assertArrayHasKey($cle, $vu['data'], "La clé « {$cle} » n'est plus transmise au gabarit.");
        }
        $this->assertSame(125_000.0, $vu['data']['amount']);
    }

    public function test_the_bypassed_template_is_gone(): void
    {
        // L'ancien gabarit portait sa propre page HTML complète — en-tête, pied de page et
        // feuille de style — hors de `pdf.layouts.base`, et formatait le montant à la main.
        // Le laisser sur le disque, c'est laisser la prochaine personne le retrouver et
        // l'employer : *un fichier qu'on garde « au cas où » est un précédent, pas une archive.*
        $this->assertFalse(
            view()->exists('payments.receipt'),
            'Le gabarit contourné `payments/receipt.blade.php` doit rester supprimé (TCK-354).',
        );
    }
}
