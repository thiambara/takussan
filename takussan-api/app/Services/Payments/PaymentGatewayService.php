<?php

namespace App\Services\Payments;

use App\Contracts\Payments\PaymentDriverContract;
use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentProvider;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Services\Admin\PlatformSettingService;
use App\Services\Payments\Drivers\LemonSqueezyDriver;
use App\Services\Payments\Drivers\OrangeMoneyDriver;
use App\Services\Payments\Drivers\WaveDriver;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus as PaymentDriverStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\InputBag;

/**
 * Orchestrator: picks the right driver, runs business validations, mutates
 * the local payment row consistently with the webhook contract.
 */
class PaymentGatewayService
{
    /**
     * Resolve the active `Integration` for `(provider, agency)`. Falls back
     * to a global integration (`agency_id = null`) when no agency-specific
     * record exists.
     */
    public function resolveIntegration(PaymentProvider $provider, ?int $agencyId): ?Integration
    {
        $query = Integration::query()
            ->where('provider', $provider->value)
            ->where('is_active', true);

        if ($agencyId === null) {
            return $query->whereNull('agency_id')->first();
        }

        return $query->where(function ($q) use ($agencyId): void {
            $q->where('agency_id', $agencyId)->orWhereNull('agency_id');
        })->orderByRaw('agency_id IS NULL')->first();
    }

    public function driverFor(Integration $integration): PaymentDriverContract
    {
        return match ($integration->provider) {
            PaymentProvider::Wave->value => new WaveDriver($integration),
            PaymentProvider::OrangeMoney->value => new OrangeMoneyDriver($integration),
            PaymentProvider::LemonSqueezy->value => new LemonSqueezyDriver($integration),
            default => abort(422, 'Unsupported payment provider: '.$integration->provider),
        };
    }

    /**
     * Initiate a checkout for `$payment` using `$provider`.
     *
     * @param  array<string,mixed>  $meta
     */
    public function initiate(Model $payment, PaymentProvider $provider, array $meta = []): CheckoutSession
    {
        $agencyId = $this->paymentAgencyId($payment);
        $integration = $this->resolveIntegration($provider, $agencyId);
        abort_unless($integration, 404, 'No active integration for provider '.$provider->value.' on this agency.');

        $currency = $this->paymentCurrency($payment);
        if (! $provider->supportsCurrency($currency)) {
            $msg = $provider === PaymentProvider::LemonSqueezy && strtoupper($currency) === 'XOF'
                ? 'Lemon Squeezy ne supporte pas XOF — utilisez Wave ou Orange Money pour un paiement en XOF.'
                : sprintf('%s does not support currency %s.', $provider->value, $currency);
            abort(422, $msg);
        }

        $amountCents = (int) round(((float) $payment->amount) * 100);
        abort_if($amountCents <= 0, 422, 'Cannot initiate a checkout for a non-positive amount.');

        $driver = $this->driverFor($integration);
        $session = $driver->initiate($payment, $amountCents, $currency, $meta);

        // Persist the gateway hint on the payment so the verify endpoint
        // and the webhook can find this row again.
        $this->recordInitiation($payment, $provider, $session);

        // Bump `last_used_at` for the integration UI surface.
        $integration->forceFill(['last_used_at' => now()])->save();

        return $session;
    }

    /**
     * Verify a payment with the provider (force-pull).
     */
    public function verify(Model $payment): ?PaymentDriverStatus
    {
        $providerValue = $this->extractProvider($payment);
        $transactionId = (string) ($payment->transaction_id ?? '');
        if ($providerValue === null || $transactionId === '') {
            return null;
        }

        $provider = PaymentProvider::tryFrom($providerValue);
        if ($provider === null) {
            return null;
        }

        $integration = $this->resolveIntegration($provider, $this->paymentAgencyId($payment));
        if ($integration === null) {
            return null;
        }

        $driver = $this->driverFor($integration);
        $status = $driver->verify($transactionId);

        $this->applyStatusToPayment($payment, $status->status, []);

        return $status;
    }

    /**
     * Process an inbound webhook for `$provider`. Idempotent on
     * `(provider, transaction_id)`.
     */
    public function handleWebhook(PaymentProvider $provider, Request $request, ?Integration $integration = null): PaymentEvent
    {
        $integration ??= Integration::query()
            ->where('provider', $provider->value)
            ->where('is_active', true)
            ->orderByRaw('agency_id IS NULL')
            ->first();
        abort_unless($integration, 404, 'No active integration for provider '.$provider->value);

        $driver = $this->driverFor($integration);
        $event = $driver->handleWebhook($request);

        $this->applyEventToMatchingPayment($event);

        return $event;
    }

    /**
     * Bridge for the lemonsqueezy/laravel package events. Receives the
     * raw payload (signature already validated upstream) and mutates the
     * matching `BookingPayment` / `LeasePayment` / `Invoice`.
     *
     * @param  array<string,mixed>  $payload
     */
    public function handleWebhookEvent(string $eventName, array $payload): ?PaymentEvent
    {
        $integration = Integration::query()
            ->where('provider', PaymentProvider::LemonSqueezy->value)
            ->where('is_active', true)
            ->orderByRaw('agency_id IS NULL')
            ->first();
        if ($integration === null) {
            return null;
        }

        $driver = new LemonSqueezyDriver($integration);
        $request = Request::create('/webhooks/payments/lemon_squeezy', 'POST', [], [], [], [], json_encode($payload));
        $request->setJson(new InputBag($payload));
        $request->headers->set('Content-Type', 'application/json');

        // Map LS event name to our normalised type without invoking the
        // public webhook surface (signature has already been verified by
        // the package).
        $type = match ($eventName) {
            'order_created' => PaymentEvent::TYPE_PAID,
            'order_refunded' => PaymentEvent::TYPE_REFUNDED,
            'subscription_payment_failed' => PaymentEvent::TYPE_FAILED,
            default => PaymentEvent::TYPE_PENDING,
        };

        $attributes = $payload['data']['attributes'] ?? [];
        $transactionId = (string) ($payload['data']['id'] ?? $attributes['identifier'] ?? '');
        if ($transactionId === '') {
            return null;
        }

        $event = new PaymentEvent(
            PaymentProvider::LemonSqueezy->value,
            $type,
            $transactionId,
            array_merge($driver->extractFees($attributes), [
                'lemon_squeezy_event' => $eventName,
                'custom_data' => $attributes['first_order_item']['custom_data'] ?? $payload['meta']['custom_data'] ?? [],
            ]),
        );

        $this->applyEventToMatchingPayment($event);

        return $event;
    }

    /**
     * Apply an event to the matching local payment row (idempotent).
     */
    public function applyEventToMatchingPayment(PaymentEvent $event): void
    {
        DB::transaction(function () use ($event): void {
            $candidates = $this->paymentsForEvent($event);
            foreach ($candidates as $payment) {
                if ($this->isAlreadyProcessed($payment, $event)) {
                    continue;
                }

                $this->applyStatusToPayment($payment, $this->mapEventTypeToDriverStatus($event->type), $event->metadata);
                $this->markAsProcessed($payment, $event);
            }
        });
    }

    protected function mapEventTypeToDriverStatus(string $type): string
    {
        return match ($type) {
            PaymentEvent::TYPE_PAID => PaymentDriverStatus::SUCCESS,
            PaymentEvent::TYPE_FAILED => PaymentDriverStatus::FAILED,
            PaymentEvent::TYPE_REFUNDED => PaymentDriverStatus::REFUNDED,
            default => PaymentDriverStatus::PENDING,
        };
    }

    /**
     * Translate a provider status into a domain `PaymentStatus` and write
     * it on the payment row. Honors the existing `HasPaymentAttributes`
     * transition matrix — invalid transitions throw 422 from the model.
     *
     * @param  array<string,mixed>  $metadata
     */
    protected function applyStatusToPayment(Model $payment, string $providerStatus, array $metadata = []): void
    {
        $existingMeta = is_array($payment->metadata ?? null) ? $payment->metadata : [];

        $current = $payment->status instanceof PaymentStatus ? $payment->status : PaymentStatus::tryFrom((string) $payment->status);

        // Already paid / refunded — never regress to pending. We still log
        // the late event in metadata for traceability.
        if ($current === PaymentStatus::Paid && $providerStatus === PaymentDriverStatus::PENDING) {
            $payment->metadata = array_merge($existingMeta, ['gateway_late_event' => array_merge($existingMeta['gateway_late_event'] ?? [], [now()->toIso8601String()])]);
            $payment->save();

            return;
        }

        switch ($providerStatus) {
            case PaymentDriverStatus::SUCCESS:
                $payment->status = PaymentStatus::Paid;
                $payment->paid_at ??= now();
                break;
            case PaymentDriverStatus::FAILED:
                if ($current !== PaymentStatus::Paid && $current !== PaymentStatus::Refunded) {
                    $payment->status = PaymentStatus::Failed;
                }
                break;
            case PaymentDriverStatus::REFUNDED:
                if ($current === PaymentStatus::Paid) {
                    $payment->status = PaymentStatus::Refunded;
                }
                break;
            case PaymentDriverStatus::PENDING:
            default:
                if ($current === null || $current === PaymentStatus::Pending) {
                    $payment->status = PaymentStatus::Pending;
                }
        }

        $payment->metadata = array_merge($existingMeta, $metadata);
        $payment->save();
    }

    protected function recordInitiation(Model $payment, PaymentProvider $provider, CheckoutSession $session): void
    {
        $existingMeta = is_array($payment->metadata ?? null) ? $payment->metadata : [];

        $payment->fill([
            'transaction_id' => $session->transactionId,
            'metadata' => array_merge($existingMeta, [
                'gateway' => [
                    'provider' => $provider->value,
                    'transaction_id' => $session->transactionId,
                    'checkout_url' => $session->checkoutUrl,
                    'initiated_at' => now()->toIso8601String(),
                ],
            ]),
        ]);

        // Stamp the payment_method field so the consolidated history
        // surfaces the right channel without requiring a join.
        if (in_array('payment_method', $payment->getFillable(), true)) {
            $payment->payment_method = $provider->paymentMethod()->value;
        }

        $payment->save();
    }

    /**
     * @return array<int, Model>
     */
    protected function paymentsForEvent(PaymentEvent $event): array
    {
        $matches = [];
        foreach ([BookingPayment::class, LeasePayment::class, Invoice::class] as $class) {
            /** @var class-string<Model> $class */
            $rows = $class::query()
                ->where('transaction_id', $event->transactionId)
                ->lockForUpdate()
                ->get();
            foreach ($rows as $row) {
                $matches[] = $row;
            }
        }

        // Lemon Squeezy embeds our payment hint in custom_data — fall
        // back to that when the transaction id matching missed.
        if ($matches === [] && ! empty($event->metadata['custom_data']['payment_id'])) {
            $paymentId = (int) $event->metadata['custom_data']['payment_id'];
            $type = (string) ($event->metadata['custom_data']['payment_type'] ?? '');
            if ($paymentId > 0 && class_exists($type)) {
                /** @var class-string<Model> $type */
                $row = $type::query()->find($paymentId);
                if ($row !== null) {
                    $matches[] = $row;
                }
            }
        }

        return $matches;
    }

    protected function isAlreadyProcessed(Model $payment, PaymentEvent $event): bool
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $log = $meta['gateway_events'] ?? [];

        foreach ($log as $entry) {
            if (($entry['provider'] ?? null) === $event->provider
                && ($entry['transaction_id'] ?? null) === $event->transactionId
                && ($entry['type'] ?? null) === $event->type) {
                return true;
            }
        }

        return false;
    }

    protected function markAsProcessed(Model $payment, PaymentEvent $event): void
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        $log = $meta['gateway_events'] ?? [];
        $log[] = [
            'provider' => $event->provider,
            'transaction_id' => $event->transactionId,
            'type' => $event->type,
            'received_at' => now()->toIso8601String(),
        ];
        $meta['gateway_events'] = $log;
        $payment->metadata = $meta;
        $payment->save();
    }

    protected function extractProvider(Model $payment): ?string
    {
        $meta = is_array($payment->metadata ?? null) ? $payment->metadata : [];
        if (! empty($meta['gateway']['provider'])) {
            return (string) $meta['gateway']['provider'];
        }

        if ($payment->payment_method instanceof PaymentMethod) {
            return match ($payment->payment_method) {
                PaymentMethod::Wave => PaymentProvider::Wave->value,
                PaymentMethod::OrangeMoney => PaymentProvider::OrangeMoney->value,
                PaymentMethod::Card => PaymentProvider::LemonSqueezy->value,
                default => null,
            };
        }

        return null;
    }

    protected function paymentAgencyId(Model $payment): ?int
    {
        if ($payment instanceof BookingPayment) {
            return $payment->booking?->agency_id;
        }
        if ($payment instanceof LeasePayment) {
            return $payment->lease?->agency_id;
        }
        if ($payment instanceof Invoice) {
            return $payment->agency_id;
        }

        return null;
    }

    protected function paymentCurrency(Model $payment): string
    {
        $currency = $payment->currency ?? null;
        if (is_object($currency) && property_exists($currency, 'value')) {
            return (string) $currency->value;
        }
        if (is_string($currency) && $currency !== '') {
            return $currency;
        }

        // TCK-084 will move agency currency to a top-level column. Until
        // then, fall back to XOF (Senegal default).
        $agencyId = $this->paymentAgencyId($payment);
        if ($agencyId !== null) {
            $agency = Agency::find($agencyId);
            if ($agency) {
                $settings = is_array($agency->settings ?? null) ? $agency->settings : [];
                if (! empty($settings['currency'])) {
                    return strtoupper((string) $settings['currency']);
                }
                $columnCurrency = $agency->getAttribute('currency');
                if ($columnCurrency) {
                    return strtoupper((string) (is_object($columnCurrency) ? $columnCurrency->value : $columnCurrency));
                }
            }
        }

        return app(PlatformSettingService::class)->getValue('currency.default');
    }
}
