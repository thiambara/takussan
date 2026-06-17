<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * TCK-283 — Inbound delivery-status webhook from WhatsApp Cloud (Meta).
 *
 * Auth model: random URL `{token}` (rotated on compromise) + the
 * `X-Hub-Signature-256` HMAC of the raw body keyed by the Meta app secret.
 * The handler is idempotent (status updates are no-ops once applied),
 * returns 200 immediately, and defers the per-status attempt update to an
 * async job.
 *
 * Payload shape (statuses only — message receipt is inbound, out of scope):
 * ```
 * { "entry": [ { "changes": [ { "field": "messages", "value": {
 *     "statuses": [ { "id": "wamid.X", "status": "delivered",
 *                     "timestamp": "1700000000", "recipient_id": "221...",
 *                     "errors": [ { "title": "…" } ] } ] } } ] } ] }
 * ```
 */
class WhatsappStatusController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $token = (string) config('whatsapp.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }

        $this->verifySignature($request);

        foreach ($this->extractStatuses($request) as $status) {
            $messageId = (string) ($status['id'] ?? '');
            $metaStatus = (string) ($status['status'] ?? '');
            if ($messageId === '' || $metaStatus === '') {
                continue;
            }
            UpdateWhatsappDeliveryStatusJob::dispatch(
                providerMessageId: $messageId,
                metaStatus: $metaStatus,
                failureReason: $this->failureReason($status),
                timestamp: isset($status['timestamp']) ? (int) $status['timestamp'] : null,
            );
        }

        // 200 immediately — Meta retries on any non-2xx.
        return new JsonResponse(['ok' => true]);
    }

    /**
     * Verify the `X-Hub-Signature-256` HMAC against the raw request body.
     * Skipped when no app secret is configured — but only outside
     * production. In production an unset secret is a misconfiguration, not a
     * convenience: we fail closed rather than silently accept unsigned
     * webhooks (the URL token alone is not sufficient auth there).
     */
    private function verifySignature(Request $request): void
    {
        $secret = (string) config('whatsapp.webhook_app_secret', '');
        if ($secret === '') {
            if (app()->isProduction()) {
                Log::error('[whatsapp.webhook] app secret not configured in production — rejecting unsigned status webhook');
                abort(403, 'Webhook signature verification not configured');
            }

            return;
        }
        $header = (string) $request->header('X-Hub-Signature-256', '');
        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);
        if ($header === '' || ! hash_equals($expected, $header)) {
            abort(403, 'Invalid signature');
        }
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function extractStatuses(Request $request): array
    {
        $statuses = [];
        foreach ((array) $request->input('entry', []) as $entry) {
            foreach ((array) ($entry['changes'] ?? []) as $change) {
                foreach ((array) ($change['value']['statuses'] ?? []) as $status) {
                    if (is_array($status)) {
                        $statuses[] = $status;
                    }
                }
            }
        }

        return $statuses;
    }

    /**
     * @param  array<string,mixed>  $status
     */
    private function failureReason(array $status): ?string
    {
        $error = $status['errors'][0] ?? null;
        if (! is_array($error)) {
            return null;
        }

        return (string) ($error['title'] ?? $error['message'] ?? $error['code'] ?? 'whatsapp_failed') ?: null;
    }
}
