<?php

namespace App\Services\Payments\Drivers;

use App\Contracts\Payments\PaymentDriverContract;
use App\Models\Integration;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Orange Money Merchant API driver (Senegal).
 *
 * Reference: https://developer.orange.com/apis/om-webpay/
 *
 *   POST https://api.orange.com/orange-money-webpay/dev/v1/webpayment
 *   Authorization: Bearer {access_token}
 *   { "merchant_key": "...", "currency": "OUV", "order_id": "...", "amount": 1000, "return_url": "...", "cancel_url": "...", "notif_url": "..." }
 *
 * Webhook signature: header `X-OM-Signature: <hmac_sha256(secret, body)>` (hex).
 */
class OrangeMoneyDriver implements PaymentDriverContract
{
    public const PROVIDER = 'orange_money';

    public function __construct(protected Integration $integration) {}

    public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
    {
        $accessToken = $this->credential('access_token');
        $merchantKey = $this->credential('merchant_key');

        // OM amounts are in major units (XOF integer). Cents → integer XOF.
        $amount = (int) round($amountCents / 100);

        $payload = [
            'merchant_key' => $merchantKey,
            'currency' => strtoupper($currency) === 'XOF' ? 'OUV' : strtoupper($currency),
            'order_id' => (string) $payment->getKey().'-'.now()->getTimestampMs(),
            'amount' => $amount,
            'return_url' => $meta['return_url'] ?? config('app.frontend_url').'/app/payments/return?status=success',
            'cancel_url' => $meta['cancel_url'] ?? config('app.frontend_url').'/app/payments/return?status=failed',
            'notif_url' => $meta['notif_url'] ?? rtrim((string) config('app.url'), '/').'/api/webhooks/payments/orange_money',
            'lang' => 'fr',
            'reference' => 'TKS-'.$payment->getKey(),
        ];

        $response = Http::withToken($accessToken)
            ->acceptJson()
            ->asJson()
            ->connectTimeout(5)
            ->timeout(20)
            ->post($this->baseUrl().'/orange-money-webpay/v1/webpayment', $payload);

        abort_if(! $response->successful(), 502, 'Orange Money checkout failed: '.$response->body());

        $data = $response->json();
        $checkoutUrl = (string) ($data['payment_url'] ?? '');
        $transactionId = (string) ($data['pay_token'] ?? $data['notif_token'] ?? '');
        abort_if($checkoutUrl === '' || $transactionId === '', 502, 'Orange Money returned an invalid checkout payload.');

        return new CheckoutSession(
            checkoutUrl: $checkoutUrl,
            transactionId: $transactionId,
            provider: self::PROVIDER,
            rawPayload: is_array($data) ? $data : [],
        );
    }

    public function verify(string $externalId): PaymentStatus
    {
        $accessToken = $this->credential('access_token');

        $response = Http::withToken($accessToken)
            ->acceptJson()
            ->connectTimeout(5)
            ->timeout(15)
            ->retry(2, 200, throw: false)
            ->get($this->baseUrl().'/orange-money-webpay/v1/transactionstatus', [
                'pay_token' => $externalId,
            ]);

        abort_if(! $response->successful(), 502, 'Orange Money verify failed: '.$response->body());
        $data = $response->json();
        $status = match (strtoupper((string) ($data['status'] ?? ''))) {
            'SUCCESS', 'SUCCESSFULL' => PaymentStatus::SUCCESS,
            'FAILED', 'EXPIRED' => PaymentStatus::FAILED,
            default => PaymentStatus::PENDING,
        };

        return new PaymentStatus($status, $externalId, is_array($data) ? $data : []);
    }

    public function handleWebhook(Request $request): PaymentEvent
    {
        $secret = $this->credential('webhook_secret');
        $signature = (string) $request->header('X-OM-Signature', '');

        $expected = hash_hmac('sha256', $request->getContent(), $secret);
        abort_unless($signature !== '' && hash_equals($expected, $signature), 401, 'Orange Money webhook signature mismatch.');

        $payload = $request->all();
        $transactionId = (string) ($payload['pay_token'] ?? $payload['txnid'] ?? '');
        abort_if($transactionId === '', 422, 'Orange Money webhook missing transaction id.');

        $status = strtoupper((string) ($payload['status'] ?? ''));
        $type = match ($status) {
            'SUCCESS', 'SUCCESSFULL' => PaymentEvent::TYPE_PAID,
            'FAILED', 'EXPIRED' => PaymentEvent::TYPE_FAILED,
            'REFUNDED' => PaymentEvent::TYPE_REFUNDED,
            default => PaymentEvent::TYPE_PENDING,
        };

        return new PaymentEvent(self::PROVIDER, $type, $transactionId, [
            'amount' => $payload['amount'] ?? null,
            'currency' => $payload['currency'] ?? null,
            'om_status' => $status,
        ]);
    }

    protected function baseUrl(): string
    {
        return rtrim((string) ($this->integration->credentials['base_url'] ?? 'https://api.orange.com'), '/');
    }

    protected function credential(string $key): string
    {
        $creds = $this->integration->credentials ?? [];
        $value = is_array($creds) ? ($creds[$key] ?? null) : null;
        abort_if(empty($value), 500, "Orange Money integration is missing credential `{$key}`.");

        return (string) $value;
    }
}
