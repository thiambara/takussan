<?php

namespace Tests\Unit\Payments;

use App\Models\Integration;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\InputBag;
use Tests\TestCase;

/**
 * TCK-734 (P04.06) — `assertReportedAmountCoversPayment()` ne compare rien quand l'événement « payé »
 * ne porte pas `amount` et `currency` : un pilote qui les omet solde une échéance pour n'importe quel
 * montant. Lemon Squeezy n'en rendait aucun. Chaque pilote de `DRIVERS` doit donc les fournir, en
 * unité majeure, depuis un exemple de sa notification « payé ».
 *
 * Un pilote ajouté à `DRIVERS` sans exemple ici fait rougir ce test : c'est voulu (Flutterwave, à sa
 * création).
 */
class PaymentDriverReportsAmountTest extends TestCase
{
    /**
     * Pilotes dont la forme réelle de la notification n'est pas connue du dépôt.
     *
     * @var array<string,string>
     */
    private const EN_ATTENTE = [
        // P04.06, reste du porteur : la devise renvoyée (`OUV` du bac à sable ou `XOF`) attend un
        // exemple réel de notification.
        'orange_money' => 'exemple réel de notification',
    ];

    public function test_every_driver_reports_a_numeric_amount_and_a_currency_on_a_paid_event(): void
    {
        $this->assertNotEmpty(PaymentGatewayService::DRIVERS);

        foreach (PaymentGatewayService::DRIVERS as $provider => $driver) {
            if (array_key_exists($provider, self::EN_ATTENTE)) {
                continue;
            }

            [$credentials, $request, $expectedAmount, $expectedCurrency] = $this->paidNotification($provider);
            $event = (new $driver(new Integration(['provider' => $provider, 'credentials' => $credentials])))->handleWebhook($request);

            $this->assertSame(PaymentEvent::TYPE_PAID, $event->type, $provider);
            $this->assertTrue(is_numeric($event->metadata['amount'] ?? null), "{$provider} : l'événement « payé » ne porte pas de montant numérique");
            $this->assertEqualsWithDelta($expectedAmount, (float) $event->metadata['amount'], 0.001, "{$provider} : le montant n'est pas en unité majeure");
            $this->assertSame($expectedCurrency, strtoupper((string) ($event->metadata['currency'] ?? '')), "{$provider} : devise absente ou fausse");
        }
    }

    /**
     * @return array{0: array<string,string>, 1: Request, 2: float, 3: string}
     */
    private function paidNotification(string $provider): array
    {
        return match ($provider) {
            'wave' => (function (): array {
                // Wave : `checkout.session.completed`, montant en chaîne et en unité majeure.
                $payload = ['type' => 'checkout.session.completed', 'data' => ['id' => 'cos_1', 'amount' => '150000', 'currency' => 'XOF']];
                $body = (string) json_encode($payload);
                $signature = 't=1700000000,v1='.hash_hmac('sha256', '1700000000.'.$body, 'wave_secret');

                return [['api_key' => 'k', 'webhook_secret' => 'wave_secret'], $this->request($payload, $body, ['HTTP_WAVE_SIGNATURE' => $signature]), 150000.0, 'XOF'];
            })(),
            'lemon_squeezy' => (function (): array {
                // Lemon Squeezy : `order_created`, `total` en centimes de la devise de la boutique.
                $payload = ['meta' => ['event_name' => 'order_created'], 'data' => ['id' => 'ord_1', 'attributes' => [
                    'total' => 1999, 'tax' => 100, 'total_usd' => 1999, 'currency' => 'USD', 'status' => 'paid',
                ]]];
                $body = (string) json_encode($payload);

                return [
                    ['api_key' => 'k', 'store_id' => 's', 'variant_id' => 'v', 'signing_secret' => 'ls_secret'],
                    $this->request($payload, $body, ['HTTP_X_SIGNATURE' => hash_hmac('sha256', $body, 'ls_secret')]),
                    19.99,
                    'USD',
                ];
            })(),
            default => $this->fail("{$provider} : aucun exemple de notification « payé » — la garde de sous-paiement ne s'appliquerait pas à ce pilote (P04.06)"),
        };
    }

    /**
     * @param  array<string,mixed>  $payload
     * @param  array<string,string>  $server
     */
    private function request(array $payload, string $body, array $server): Request
    {
        $request = Request::create('/webhooks/payments/x', 'POST', [], [], [], $server + ['CONTENT_TYPE' => 'application/json'], $body);
        $request->setJson(new InputBag($payload));

        return $request;
    }
}
