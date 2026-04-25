<?php

namespace App\Listeners\Payments;

use App\Services\Payments\PaymentGatewayService;
use LemonSqueezy\Laravel\Events\OrderCreated;
use LemonSqueezy\Laravel\Events\OrderRefunded;
use LemonSqueezy\Laravel\Events\SubscriptionCreated;

/**
 * Bridges `lemonsqueezy/laravel` events (already signature-verified by
 * the package) onto our domain `PaymentGatewayService`. Subscribers
 * pattern lets us keep one listener class for the three events.
 */
class LemonSqueezyEventListener
{
    public function __construct(protected PaymentGatewayService $gateway) {}

    public function handleOrderCreated(OrderCreated $event): void
    {
        $this->gateway->handleWebhookEvent('order_created', $event->payload);
    }

    public function handleOrderRefunded(OrderRefunded $event): void
    {
        $this->gateway->handleWebhookEvent('order_refunded', $event->payload);
    }

    public function handleSubscriptionCreated(SubscriptionCreated $event): void
    {
        $this->gateway->handleWebhookEvent('subscription_created', $event->payload);
    }

    /**
     * Register listeners.
     *
     * @return array<class-string, string>
     */
    public function subscribe(): array
    {
        return [
            OrderCreated::class => 'handleOrderCreated',
            OrderRefunded::class => 'handleOrderRefunded',
            SubscriptionCreated::class => 'handleSubscriptionCreated',
        ];
    }
}
