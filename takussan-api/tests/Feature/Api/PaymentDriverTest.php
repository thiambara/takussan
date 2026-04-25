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
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\InputBag;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PaymentDriverTest extends TestCase
{
    use RefreshDatabase;

    public function test_wave_driver_initiate_calls_api_with_correct_payload(): void
    {
        Http::fake([
            'api.wave.com/v1/checkout/sessions' => Http::response([
                'id' => 'cs_999',
                'wave_launch_url' => 'https://pay.wave.com/c/cs_999',
            ], 200),
        ]);

        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'credentials' => ['api_key' => 'wave_test', 'webhook_secret' => 's'],
        ]);
        $driver = new WaveDriver($integration);

        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 250.00,
            'currency' => Currency::XOF,
        ]);

        $session = $driver->initiate($payment, 25000, 'XOF', ['return_url' => 'https://example.com/return']);

        $this->assertSame('cs_999', $session->transactionId);
        $this->assertSame('https://pay.wave.com/c/cs_999', $session->checkoutUrl);

        Http::assertSent(function ($request) {
            $body = json_decode($request->body() ?: '{}', true);

            return str_contains($request->url(), '/v1/checkout/sessions')
                && $request->hasHeader('Authorization', 'Bearer wave_test')
                && ($body['amount'] ?? null) === '250'
                && ($body['currency'] ?? null) === 'XOF';
        });
    }

    public function test_wave_driver_verify_returns_pending_for_unknown_status(): void
    {
        Http::fake([
            'api.wave.com/v1/checkout/sessions/cs_unk' => Http::response([
                'payment_status' => 'processing',
            ], 200),
        ]);

        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 's'],
        ]);

        $status = (new WaveDriver($integration))->verify('cs_unk');
        $this->assertSame(PaymentStatus::PENDING, $status->status);
    }

    public function test_wave_driver_handle_webhook_signature_mismatch(): void
    {
        $integration = Integration::factory()->create([
            'provider' => 'wave',
            'credentials' => ['api_key' => 'k', 'webhook_secret' => 'real_secret'],
        ]);

        $payload = ['type' => 'session.completed', 'data' => ['id' => 'cs_x']];
        $body = json_encode($payload);
        $request = Request::create('/x', 'POST', [], [], [], ['HTTP_WAVE_SIGNATURE' => 't=1,v1=bad'], $body);
        $request->setJson(new InputBag($payload));

        $this->expectException(HttpException::class);
        try {
            (new WaveDriver($integration))->handleWebhook($request);
        } catch (HttpException $e) {
            $this->assertSame(401, $e->getStatusCode());
            throw $e;
        }
    }

    public function test_orange_money_driver_initiate_calls_api(): void
    {
        Http::fake([
            'api.orange.com/orange-money-webpay/v1/webpayment' => Http::response([
                'pay_token' => 'omt_321',
                'payment_url' => 'https://webpayment.orange-money.com/pay/omt_321',
            ], 200),
        ]);

        $integration = Integration::factory()->create([
            'provider' => 'orange_money',
            'credentials' => ['access_token' => 'om_token', 'merchant_key' => 'mk', 'webhook_secret' => 's'],
        ]);

        $agency = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $payment = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 100.00,
            'currency' => Currency::XOF,
        ]);

        $session = (new OrangeMoneyDriver($integration))->initiate($payment, 10000, 'XOF');
        $this->assertSame('omt_321', $session->transactionId);
    }

    public function test_orange_money_handles_webhook_paid(): void
    {
        $secret = 'om_shared_secret';
        $integration = Integration::factory()->create([
            'provider' => 'orange_money',
            'credentials' => [
                'access_token' => 't', 'merchant_key' => 'm', 'webhook_secret' => $secret,
            ],
        ]);

        $payload = ['pay_token' => 'omt_999', 'status' => 'SUCCESS', 'amount' => 100];
        $body = json_encode($payload);
        $sig = hash_hmac('sha256', $body, $secret);
        $request = Request::create('/x', 'POST', [], [], [], ['HTTP_X_OM_SIGNATURE' => $sig, 'CONTENT_TYPE' => 'application/json'], $body);
        $request->setJson(new InputBag($payload));

        $event = (new OrangeMoneyDriver($integration))->handleWebhook($request);

        $this->assertSame(PaymentEvent::TYPE_PAID, $event->type);
        $this->assertSame('omt_999', $event->transactionId);
    }
}
