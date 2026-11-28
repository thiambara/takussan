<?php

namespace Tests\Feature\Api;

use App\Models\Integration;
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

    public function test_orange_money_handles_webhook_paid(): void
    {
        $secret = 'om_shared_secret';
        $integration = Integration::factory()->create([
            'provider' => 'orange_money',
            'credentials' => [
                'client_id' => 'om_client', 'client_secret' => 'om_secret', 'merchant_key' => 'm', 'webhook_secret' => $secret,
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
