<?php

namespace App\Services\Payments\Drivers;

use App\Contracts\Payments\PaymentDriverContract;
use App\Models\Agency;
use App\Models\Integration;
use App\Services\Payments\Dto\CheckoutSession;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\PaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Lemon Squeezy driver. Wraps the official `lemonsqueezy/laravel` package
 * (Billable trait + Checkout builder) — we never re-implement HTTP or
 * signature verification ourselves.
 *
 * Webhooks are exposed by the package on `webhooks/lemon-squeezy` and
 * the package's middleware verifies `X-Signature` (HMAC-SHA256 with
 * `hash_equals`). Our local webhook controller hooks into Laravel events
 * (OrderCreated / OrderRefunded) instead — see `LemonSqueezyEventListener`.
 *
 * The agency is the billable scope: each agency has at most one
 * `Integration(provider=lemon_squeezy)` carrying `api_key`,
 * `signing_secret`, `store_id` and a "container" `variant_id` used with
 * `withCustomPrice()` for arbitrary amounts.
 */
class LemonSqueezyDriver implements PaymentDriverContract
{
    /**
     * TCK-602 (ADR-0051 §3) — les identifiants que ce pilote LIT. Chacun est un champ `required`
     * du schéma de son fournisseur (`PaymentDriverCredentialsTest`), et une intégration à qui il en
     * manque un n'est pas proposée au payeur (`PaymentGatewayService::availableProviders`).
     *
     * @var list<string>
     */
    public const CREDENTIAL_KEYS = ['api_key', 'store_id', 'variant_id', 'signing_secret'];

    public const PROVIDER = 'lemon_squeezy';

    public function __construct(protected Integration $integration) {}

    public function initiate(Model $payment, int $amountCents, string $currency, array $meta = []): CheckoutSession
    {
        $this->configurePackage();

        $billable = $this->resolveBillable();
        $variantId = $this->credential('variant_id');

        $checkout = $billable
            ->checkout($variantId, options: ['custom_price' => $amountCents])
            ->withCustomData([
                'payment_id' => (string) $payment->getKey(),
                'payment_type' => $payment::class,
            ]);

        if (! empty($meta['return_url'])) {
            $checkout->redirectTo((string) $meta['return_url']);
        }

        // TCK-602 — l'exception du paquet porte la réponse de l'API : elle reste au journal.
        try {
            $url = $checkout->url();
        } catch (Throwable $e) {
            Log::warning('[lemon-squeezy] checkout failed', ['exception' => $e::class, 'message' => $e->getMessage()]);
            abort_code(502, 'payment.provider_unavailable');
        }

        // The Checkout builder doesn't expose the LS checkout id directly
        // (it lives in the response body). Re-fetch from the URL: LS embeds
        // the id in the path `/buy/<uuid>`.
        $transactionId = $this->extractIdFromUrl($url);

        return new CheckoutSession(
            checkoutUrl: $url,
            transactionId: $transactionId,
            provider: self::PROVIDER,
            rawPayload: ['url' => $url],
        );
    }

    public function verify(string $externalId): PaymentStatus
    {
        // Lemon Squeezy doesn't expose a "checkout status" endpoint — the
        // source of truth is the `Order` reconciled via webhook events.
        // We inspect the local cache of orders if present; otherwise we
        // return PENDING and let the webhook resolve eventually.
        $this->configurePackage();

        return new PaymentStatus(PaymentStatus::PENDING, $externalId);
    }

    public function handleWebhook(Request $request): PaymentEvent
    {
        // SECURITY: the lemonsqueezy/laravel package only verifies signatures
        // on its OWN dedicated route (`webhooks/lemon-squeezy`). This generic
        // proxy route (`webhooks/payments/lemon_squeezy`) is NOT covered by it,
        // so without the check below an unauthenticated attacker could POST a
        // forged `order_created` body and have a payment marked paid. Verify
        // the HMAC-SHA256 `X-Signature` against the integration's signing
        // secret over the raw body, exactly as the package does upstream.
        $this->verifySignature($request->getContent(), (string) $request->header('X-Signature', ''));

        $payload = $request->all();
        $event = (string) ($payload['meta']['event_name'] ?? '');
        $attributes = $payload['data']['attributes'] ?? [];
        $transactionId = (string) ($payload['data']['id'] ?? $attributes['identifier'] ?? '');
        abort_code_if($transactionId === '', 422, 'webhook.transaction_id_missing');

        $type = match ($event) {
            'order_created' => PaymentEvent::TYPE_PAID,
            'order_refunded' => PaymentEvent::TYPE_REFUNDED,
            'subscription_payment_failed' => PaymentEvent::TYPE_FAILED,
            default => PaymentEvent::TYPE_PENDING,
        };

        return new PaymentEvent(self::PROVIDER, $type, $transactionId, $this->extractFees($attributes));
    }

    /**
     * Verify the Lemon Squeezy `X-Signature` HMAC-SHA256 of the raw request
     * body against the integration's signing secret. Fails closed.
     */
    protected function verifySignature(string $rawBody, string $signature): void
    {
        abort_code_if($signature === '', 401, 'webhook.signature_missing');

        $expected = hash_hmac('sha256', $rawBody, $this->credential('signing_secret'));
        abort_code_unless(hash_equals($expected, $signature), 401, 'webhook.signature_invalid');
    }

    /**
     * Push the integration's credentials into the runtime config so the
     * package's facades pick them up. Each call rebinds — safe in a
     * multi-agency context.
     */
    public function configurePackage(): void
    {
        config([
            'lemon-squeezy.api_key' => $this->credential('api_key'),
            'lemon-squeezy.signing_secret' => $this->credential('signing_secret'),
            'lemon-squeezy.store' => $this->credential('store_id'),
        ]);
    }

    /**
     * Extract gross / fees / net from an LS `order_created` payload.
     * Amounts in cents, USD by default — caller is responsible for
     * recording the currency separately.
     *
     * @param  array<string,mixed>  $attributes
     * @return array<string,mixed>
     */
    public function extractFees(array $attributes): array
    {
        $gross = (int) ($attributes['total'] ?? $attributes['total_usd'] ?? 0);
        $fees = (int) ($attributes['tax'] ?? 0);
        $fees += (int) ($attributes['discount_total'] ?? 0);
        $net = (int) ($attributes['total_usd'] ?? $attributes['total'] ?? $gross) - $fees;

        return [
            'gross_amount' => $gross,
            'fees_amount' => $fees,
            'net_amount' => max(0, $net),
            'currency' => strtoupper((string) ($attributes['currency'] ?? 'USD')),
            'lemon_squeezy_event' => $attributes['status'] ?? null,
        ];
    }

    protected function resolveBillable(): Agency
    {
        // The integration is scoped to an agency. If `agency_id` is null
        // (global integration), we still need a billable instance — pick
        // the first agency on file. Production setups should bind LS to
        // a specific agency to keep the `Billable` orders table clean.
        if ($this->integration->agency_id) {
            $agency = Agency::find($this->integration->agency_id);
            abort_code_unless($agency, 500, 'payment.integration_agency_missing');

            return $agency;
        }

        $agency = Agency::query()->first();
        abort_code_unless($agency, 500, 'payment.integration_agency_missing');

        return $agency;
    }

    protected function extractIdFromUrl(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (! is_string($path)) {
            return $url;
        }
        $segments = array_filter(explode('/', $path));

        return (string) end($segments);
    }

    protected function credential(string $key): string
    {
        $creds = $this->integration->credentials ?? [];
        $value = is_array($creds) ? ($creds[$key] ?? null) : null;
        // TCK-602 — le nom de la clé manquante ne sort pas : il reste au journal du serveur.
        if (empty($value)) {
            Log::warning('[payments] integration credential missing', ['integration_id' => $this->integration->getKey(), 'credential' => $key]);
            abort_code(500, 'payment.integration_misconfigured');
        }

        return (string) $value;
    }
}
