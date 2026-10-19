<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Property;
use App\Services\Payments\Drivers\LemonSqueezyDriver;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use LemonSqueezy\Laravel\Events\OrderCreated;
use LemonSqueezy\Laravel\Events\OrderRefunded;
use Tests\TestCase;

class LemonSqueezyEventListenerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build context with a paid-in-progress booking payment expecting LS callback.
     */
    protected function arrange(string $orderId = 'order_ls_123', PaymentStatus $status = PaymentStatus::Pending): array
    {
        $agency = Agency::factory()->create();
        Integration::factory()->create([
            'agency_id' => $agency->id,
            'provider' => 'lemon_squeezy',
            'is_active' => true,
            'credentials' => [
                'api_key' => 'ls_key',
                'signing_secret' => 'ls_secret',
                'store_id' => 'store_1',
                'variant_id' => 'variant_1',
            ],
        ]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create();
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'agency_id' => $agency->id,
            'currency' => Currency::USD,
        ]);

        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 19.99,
            'currency' => Currency::USD,
            'status' => $status,
            'transaction_id' => $orderId,
            'payment_type' => BookingPaymentType::Deposit,
            'metadata' => ['gateway' => ['provider' => 'lemon_squeezy', 'transaction_id' => $orderId]],
        ]);

        return ['agency' => $agency, 'payment' => $payment];
    }

    public function test_order_created_event_marks_payment_paid(): void
    {
        $ctx = $this->arrange();

        $payload = [
            'meta' => ['event_name' => 'order_created'],
            'data' => [
                'id' => $ctx['payment']->transaction_id,
                'attributes' => [
                    'total' => 1999,
                    'tax' => 100,
                    'currency' => 'USD',
                    'status' => 'paid',
                    'first_order_item' => [
                        'custom_data' => [
                            'payment_id' => (string) $ctx['payment']->id,
                            'payment_type' => BookingPayment::class,
                        ],
                    ],
                ],
            ],
        ];

        // Dispatch the package event — listener is wired in AppServiceProvider.
        OrderCreated::dispatch($ctx['agency'], null, $payload);

        $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->status);
        $this->assertNotNull($ctx['payment']->paid_at);
    }

    public function test_order_refunded_event_marks_payment_refunded(): void
    {
        $ctx = $this->arrange(status: PaymentStatus::Paid);

        $payload = [
            'meta' => ['event_name' => 'order_refunded'],
            'data' => [
                'id' => $ctx['payment']->transaction_id,
                'attributes' => [
                    'total' => 1999,
                    'currency' => 'USD',
                    'first_order_item' => [
                        'custom_data' => [
                            'payment_id' => (string) $ctx['payment']->id,
                            'payment_type' => BookingPayment::class,
                        ],
                    ],
                ],
            ],
        ];

        OrderRefunded::dispatch($ctx['agency'], null, $payload);

        $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Refunded, $ctx['payment']->status);
    }

    public function test_fees_reconciliation_extracts_gross_fees_net(): void
    {
        $ctx = $this->arrange();

        $payload = [
            'meta' => ['event_name' => 'order_created'],
            'data' => [
                'id' => $ctx['payment']->transaction_id,
                'attributes' => [
                    'total' => 2099,
                    'tax' => 100,
                    'discount_total' => 0,
                    'total_usd' => 2099,
                    'currency' => 'USD',
                    'first_order_item' => [
                        'custom_data' => [
                            'payment_id' => (string) $ctx['payment']->id,
                            'payment_type' => BookingPayment::class,
                        ],
                    ],
                ],
            ],
        ];

        app(PaymentGatewayService::class)->handleWebhookEvent('order_created', $payload);

        $ctx['payment']->refresh();
        // TCK-961 (P39.06) — sous l'entrée de l'événement dans `gateway_events`, plus à la racine.
        $trace = collect($ctx['payment']->metadata['gateway_events'])->firstWhere('type', 'paid')['metadata'] ?? [];
        $this->assertSame(2099, $trace['gross_amount'] ?? null);
        $this->assertSame(100, $trace['fees_amount'] ?? null);
        $this->assertSame(1999, $trace['net_amount'] ?? null);
        $this->assertSame('USD', $trace['currency'] ?? null);
    }

    /**
     * TCK-734 (P04.06) — un ordre Lemon Squeezy inférieur au dû ne solde pas l'échéance : le pilote
     * rend désormais le montant encaissé, et la garde de sous-paiement le compare.
     */
    public function test_an_order_below_the_amount_due_does_not_settle_the_payment(): void
    {
        $ctx = $this->arrange();
        $payload = $this->orderCreated($ctx['payment'], total: 1000);

        try {
            app(PaymentGatewayService::class)->handleWebhookEvent('order_created', $payload);
            $this->fail('un ordre de 10,00 USD a soldé une échéance de 19,99 USD');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('payment.amount_short', $e->errorCode);
        }

        $this->assertSame(PaymentStatus::Pending, $ctx['payment']->refresh()->status);

        app(PaymentGatewayService::class)->handleWebhookEvent('order_created', $this->orderCreated($ctx['payment'], total: 1999));
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->refresh()->status);
    }

    /**
     * @return array<string,mixed>
     */
    private function orderCreated(BookingPayment $payment, int $total): array
    {
        return [
            'meta' => ['event_name' => 'order_created'],
            'data' => [
                'id' => $payment->transaction_id,
                'attributes' => [
                    'total' => $total,
                    'currency' => 'USD',
                    'status' => 'paid',
                    'first_order_item' => [
                        'custom_data' => [
                            'payment_id' => (string) $payment->id,
                            'payment_type' => BookingPayment::class,
                        ],
                    ],
                ],
            ],
        ];
    }

    public function test_driver_extract_fees_static(): void
    {
        $integration = Integration::factory()->create([
            'provider' => 'lemon_squeezy',
            'credentials' => [
                'api_key' => 'k', 'signing_secret' => 's', 'store_id' => 'sid', 'variant_id' => 'vid',
            ],
        ]);
        $driver = new LemonSqueezyDriver($integration);

        $fees = $driver->extractFees([
            'total' => 5000,
            'tax' => 250,
            'currency' => 'EUR',
        ]);

        $this->assertSame(5000, $fees['gross_amount']);
        $this->assertSame(250, $fees['fees_amount']);
        $this->assertSame(4750, $fees['net_amount']);
        $this->assertSame('EUR', $fees['currency']);
    }
}
