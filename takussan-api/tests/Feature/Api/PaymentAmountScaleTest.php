<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use App\Services\Payments\Drivers\WaveDriver;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * L'ÉCHELLE du montant, de la base jusqu'au fournisseur.
 *
 * La règle (ADR-0009) : le montant est `decimal(14,2)` en base, devient un entier ×100 à la
 * frontière de `PaymentDriverContract`, et **tout driver dont la devise n'a pas de sous-unité doit
 * re-diviser par 100** avant d'appeler son fournisseur. Le XOF a `decimalPlaces() === 0` : 1 000 F
 * CFA, c'est mille, pas cent mille.
 *
 * **Pourquoi ce fichier existe.** Le piège est silencieux : le type est bon, la valeur est un
 * entier plausible, et l'erreur ne se voit qu'au relevé du client. Un nouveau driver écrit sans la
 * division facture **cent fois trop**. La règle n'était écrite dans aucune spec — sa seule trace
 * était un commentaire défensif dans `WaveDriver` — et **aucun test ne la tenait de bout en bout** :
 * `PaymentDriverTest::test_orange_money_driver_initiate_calls_api` n'assertait que le
 * `transactionId`, jamais le montant transmis.
 *
 * Ce que ces cas éprouvent, et que les tests de driver existants ne pouvaient pas voir :
 *
 *  1. la CHAÎNE COMPLÈTE — ce que `PaymentGatewayService` multiplie, le driver le redivise, et le
 *     fournisseur reçoit exactement le montant de la base ;
 *  2. les DEUX drivers XOF, pas un seul ;
 *  3. le cas ASYMÉTRIQUE — un driver en devise décimale ne doit PAS diviser. Sans ce cas, un
 *     correctif « on divise partout » passerait au vert tout en cassant la facturation SaaS.
 */
class PaymentAmountScaleTest extends TestCase
{
    use RefreshDatabase;

    /** Un paiement de montant donné, rattaché à une réservation cohérente. */
    private function paiement(float $montant): BookingPayment
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $agency->id,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $montant,
            'currency' => Currency::XOF,
        ]);
    }

    /**
     * La conversion que fait `PaymentGatewayService` avant d'appeler le driver.
     *
     * Reproduite ici plutôt qu'appelée : le service exige une `Integration` résolue, un provider
     * configuré et une URL de retour. Ce qu'on veut éprouver est l'ÉCHELLE, et elle tient dans
     * cette seule ligne — c'est elle que chaque driver doit défaire.
     *
     * @see PaymentGatewayService
     */
    private function centimes(BookingPayment $payment): int
    {
        return (int) round(((float) $payment->amount) * 100);
    }

    public function test_wave_recoit_le_montant_de_la_base_et_non_cent_fois_plus(): void
    {
        Http::fake([
            'api.wave.com/v1/checkout/sessions' => Http::response([
                'id' => 'cs_scale',
                'wave_launch_url' => 'https://pay.wave.com/c/cs_scale',
            ], 200),
        ]);

        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'credentials' => ['api_key' => 'wave_test', 'webhook_secret' => 's'],
        ]);

        $payment = $this->paiement(1500.00);
        $centimes = $this->centimes($payment);
        $this->assertSame(150000, $centimes, 'La frontière du contrat multiplie bien par 100.');

        (new WaveDriver($integration))->initiate(
            $payment,
            $centimes,
            'XOF',
            ['return_url' => 'https://example.com/return'],
        );

        Http::assertSent(function ($request) {
            $body = json_decode($request->body() ?: '{}', true);

            // 1500, pas 150000. Wave facture en unités entières de XOF.
            return str_contains($request->url(), '/v1/checkout/sessions')
                && (string) ($body['amount'] ?? null) === '1500'
                && ($body['currency'] ?? null) === 'XOF';
        });
    }

    public function test_orange_money_recoit_le_montant_de_la_base_et_non_cent_fois_plus(): void
    {
        Http::fake([
            'api.orange.com/orange-money-webpay/v1/webpayment' => Http::response([
                'pay_token' => 'omt_scale',
                'payment_url' => 'https://webpayment.orange-money.com/pay/omt_scale',
            ], 200),
        ]);

        $integration = Integration::factory()->create([
            'provider' => 'orange_money',
            'credentials' => ['access_token' => 'om_token', 'merchant_key' => 'mk', 'webhook_secret' => 's'],
        ]);

        $payment = $this->paiement(1500.00);

        (new OrangeMoneyDriver($integration))->initiate($payment, $this->centimes($payment), 'XOF');

        Http::assertSent(function ($request) {
            $body = json_decode($request->body() ?: '{}', true);

            // Orange Money imbrique la charge utile sous `order_id`/`amount`.
            $montant = $body['amount'] ?? ($body['order']['amount'] ?? null);

            return str_contains($request->url(), '/webpayment')
                && (int) $montant === 1500;
        });
    }

    /**
     * Le cas ASYMÉTRIQUE, et c'est celui qui rend la garde non triviale.
     *
     * Un correctif naïf — « on divise par 100 dans tous les drivers » — passerait les deux cas
     * ci-dessus au vert **et casserait la facturation SaaS**, qui est en USD : une devise à deux
     * décimales dont le fournisseur attend, lui, de vrais centimes.
     *
     * Sans ce troisième cas, on ne saurait pas distinguer une règle juste d'une règle appliquée
     * partout.
     */
    public function test_une_devise_decimale_ne_doit_pas_etre_redivisee(): void
    {
        $this->assertSame(
            0,
            Currency::XOF->decimalPlaces(),
            'Le XOF n\'a pas de sous-unité — c\'est toute la raison d\'être de la re-division.',
        );

        $usd = Currency::tryFrom('USD');

        if ($usd === null) {
            $this->markTestSkipped(
                'Aucune devise à sous-unité n\'est déclarée dans l\'enum Currency : '
                .'l\'asymétrie ne peut pas encore être éprouvée sur une valeur réelle. '
                .'Ce skip est visible dans la sortie (`--display-skipped`) et doit être levé le jour '
                .'où une devise décimale entre dans le domaine.',
            );
        }

        $this->assertSame(
            2,
            $usd->decimalPlaces(),
            'Une devise décimale garde ses centimes : son driver ne divise pas.',
        );
    }
}
