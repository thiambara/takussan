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
 * Wave Business Checkout API driver.
 *
 * Reference: https://docs.wave.com/business#checkout
 *
 *   POST https://api.wave.com/v1/checkout/sessions
 *   Authorization: Bearer {api_key}
 *   { "amount": "1000", "currency": "XOF", "success_url": "...", "error_url": "...", "client_reference": "..." }
 *
 * Webhook signature: header `Wave-Signature: t=<unix>,v1=<hmacSha256(secret, "t.body")>`
 */
class WaveDriver implements PaymentDriverContract
{
    public const PROVIDER = 'wave';

    public function __construct(protected Integration $integration) {}

    public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
    {
        $apiKey = $this->credential('api_key');

        // Wave amounts are integers in the smallest currency unit. XOF is
        // already integer-only — the cents we receive are amount*100, so
        // dividing back avoids paying 100x the requested amount.
        $waveAmount = (int) round($amountCents / 100);

        $payload = [
            'amount' => (string) $waveAmount,
            'currency' => strtoupper($currency),
            'client_reference' => (string) $payment->getKey(),
            'success_url' => $meta['return_url'] ?? config('app.frontend_url').'/app/payments/return?status=success',
            'error_url' => $meta['cancel_url'] ?? config('app.frontend_url').'/app/payments/return?status=failed',
        ];

        $response = Http::withToken($apiKey)
            ->acceptJson()
            ->asJson()
            ->post($this->baseUrl().'/v1/checkout/sessions', $payload);

        abort_if(! $response->successful(), 502, 'Wave checkout failed: '.$response->body());

        $data = $response->json();
        $checkoutUrl = $data['wave_launch_url'] ?? $data['url'] ?? '';
        $transactionId = (string) ($data['id'] ?? '');
        abort_if($checkoutUrl === '' || $transactionId === '', 502, 'Wave returned an invalid checkout payload.');

        return new CheckoutSession(
            checkoutUrl: $checkoutUrl,
            transactionId: $transactionId,
            provider: self::PROVIDER,
            rawPayload: is_array($data) ? $data : [],
        );
    }

    public function verify(string $externalId): PaymentStatus
    {
        $apiKey = $this->credential('api_key');

        $response = Http::withToken($apiKey)
            ->acceptJson()
            ->get($this->baseUrl().'/v1/checkout/sessions/'.$externalId);

        abort_if(! $response->successful(), 502, 'Wave verify failed: '.$response->body());
        $data = $response->json();
        $status = match ($data['payment_status'] ?? $data['status'] ?? null) {
            'succeeded', 'success', 'completed' => PaymentStatus::SUCCESS,
            'failed', 'cancelled' => PaymentStatus::FAILED,
            default => PaymentStatus::PENDING,
        };

        return new PaymentStatus($status, $externalId, is_array($data) ? $data : []);
    }

    public function handleWebhook(Request $request): PaymentEvent
    {
        $secret = $this->credential('webhook_secret');
        $signature = (string) $request->header('Wave-Signature', '');

        $this->verifySignature($request->getContent(), $signature, $secret);

        $payload = $request->all();
        $eventType = (string) ($payload['type'] ?? '');
        $session = $payload['data'] ?? [];
        $transactionId = (string) ($session['id'] ?? '');
        abort_if($transactionId === '', 422, 'Wave webhook missing transaction id.');

        $type = match (true) {
            str_contains($eventType, 'completed'), str_contains($eventType, 'succeeded') => PaymentEvent::TYPE_PAID,
            str_contains($eventType, 'failed') => PaymentEvent::TYPE_FAILED,
            str_contains($eventType, 'refund') => PaymentEvent::TYPE_REFUNDED,
            default => PaymentEvent::TYPE_PENDING,
        };

        return new PaymentEvent(self::PROVIDER, $type, $transactionId, [
            'amount' => $session['amount'] ?? null,
            'currency' => $session['currency'] ?? null,
            'event' => $eventType,
        ]);
    }

    protected function verifySignature(string $rawBody, string $signature, string $secret): void
    {
        // Wave signature shape: `t=<timestamp>,v1=<hmac_sha256(secret, t.body)>`
        $parts = [];
        foreach (explode(',', $signature) as $segment) {
            [$k, $v] = array_pad(explode('=', trim($segment), 2), 2, null);
            if ($k !== null && $v !== null) {
                $parts[$k] = $v;
            }
        }

        $timestamp = $parts['t'] ?? null;
        $provided = $parts['v1'] ?? null;
        abort_if($timestamp === null || $provided === null, 401, 'Wave webhook signature missing.');

        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);
        abort_unless(hash_equals($expected, $provided), 401, 'Wave webhook signature mismatch.');
    }

    protected function baseUrl(): string
    {
        return rtrim((string) ($this->integration->credentials['base_url'] ?? 'https://api.wave.com'), '/');
    }

    protected function credential(string $key): string
    {
        $creds = $this->integration->credentials ?? [];
        $value = is_array($creds) ? ($creds[$key] ?? null) : null;
        abort_if(empty($value), 500, "Wave integration is missing credential `{$key}`.");

        return (string) $value;
    }
}
