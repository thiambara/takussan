<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Payments\Drivers\LemonSqueezyDriver;
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
     * Le cas ASYMÉTRIQUE — et il appelle un DRIVER, ce qui est tout son objet.
     *
     * Un correctif naïf — « on divise par 100 dans tous les drivers » — passerait les deux cas
     * ci-dessus au vert **et casserait la facturation SaaS**, qui est en USD : une devise à deux
     * décimales dont le fournisseur attend, lui, de vrais centimes.
     *
     * Une première version de ce cas ne lisait que `Currency::USD->decimalPlaces()`. Elle
     * n'appelait aucun driver — donc la régression que son docblock annonçait attraper serait
     * passée au vert. *Un test qui n'exerce pas le chemin qu'il prétend garder ne garde rien*,
     * et il est plus dangereux qu'aucun test parce qu'il occupe la place.
     */
    public function test_lemon_squeezy_recoit_des_centimes_et_ne_redivise_pas(): void
    {
        Http::fake([
            'api.lemonsqueezy.com/*' => Http::response([
                'data' => [
                    'id' => '99',
                    'attributes' => ['url' => 'https://takussan.lemonsqueezy.com/buy/abc-123'],
                ],
            ], 200),
        ]);

        $agency = Agency::factory()->create();
        $integration = Integration::factory()->create([
            'provider' => 'lemon_squeezy',
            'agency_id' => $agency->id,
            'credentials' => [
                'api_key' => 'ls_test',
                'signing_secret' => 'sig',
                'store_id' => '1',
                'variant_id' => '42',
            ],
        ]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 25.00,
            'currency' => Currency::XOF,
        ]);

        // 25,00 dans une devise à deux décimales → 2500 centimes à la frontière du contrat.
        (new LemonSqueezyDriver($integration))->initiate($payment, 2500, 'USD');

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'lemonsqueezy.com')) {
                return false;
            }
            $body = json_decode($request->body() ?: '{}', true);

            // 2500, PAS 25. Lemon Squeezy facture en centimes : re-diviser ici retirerait
            // deux zéros à chaque abonnement.
            return data_get($body, 'data.attributes.custom_price') === 2500;
        });
    }

    /** Le fait qui rend toute la règle nécessaire : le XOF n'a pas de sous-unité. */
    public function test_le_xof_n_a_pas_de_sous_unite_et_l_usd_en_a_une(): void
    {
        $this->assertSame(0, Currency::XOF->decimalPlaces());
        $this->assertSame(2, Currency::tryFrom('USD')?->decimalPlaces());
    }
}
