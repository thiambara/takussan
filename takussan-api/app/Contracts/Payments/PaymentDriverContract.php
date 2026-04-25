<?php

namespace App\Contracts\Payments;

use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Common interface implemented by every payment driver (Wave, Orange Money,
 * Lemon Squeezy…). Driver instances are stateless — they receive their
 * `Integration` (credentials) via the constructor, and the orchestrator
 * (`PaymentGatewayService`) wires the driver to the right `Integration`
 * before dispatching.
 */
interface PaymentDriverContract
{
    /**
     * Initiate a checkout session for `$payment` (a `BookingPayment`,
     * `LeasePayment` or `Invoice` row). Returns the provider-side
     * `CheckoutSession` (URL + transaction id).
     *
     * @param  array<string,mixed>  $meta  Driver-specific extras (return_url, cancel_url, ...)
     */
    public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession;

    /**
     * Force-verify a payment with the provider (fallback when no webhook
     * has been received yet).
     */
    public function verify(string $externalId): PaymentStatus;

    /**
     * Translate a webhook HTTP request into a normalised `PaymentEvent`.
     * Implementations MUST verify the provider signature here (or rely on
     * the underlying SDK to do so) and throw a 401 `HttpException` on
     * mismatch.
     */
    public function handleWebhook(Request $request): PaymentEvent;
}
