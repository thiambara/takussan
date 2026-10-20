<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Jobs\UpdateWhatsappDeliveryStatusJob;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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
    public function __invoke(Request $request, WebhookJournal $journal): JsonResponse
    {
        $this->guardUrlToken($request);

        return $this->process($request, $journal);
    }

    /**
     * P36.05 (TCK-944) — la vérification d'abonnement de Meta : pour enregistrer l'URL de rappel,
     * Meta appelle ce chemin en `GET` avec `hub.mode=subscribe`, `hub.verify_token` et
     * `hub.challenge`, et attend le défi en texte brut. Gardée par le même jeton d'URL, puis par
     * `whatsapp.webhook_verify_token`, comparé en temps constant ; un jeton non configuré refuse.
     *
     * PHP reçoit `hub.mode` en `hub_mode` : il remplace les points des noms de paramètres.
     */
    public function verify(Request $request): Response
    {
        $this->guardUrlToken($request);

        $expected = (string) config('whatsapp.webhook_verify_token', '');
        $candidate = (string) $request->query('hub_verify_token', '');
        if ($request->query('hub_mode') !== 'subscribe' || $expected === '' || ! hash_equals($expected, $candidate)) {
            abort_code(403, 'webhook.verify_token_invalid');
        }

        return new Response((string) $request->query('hub_challenge', ''), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    private function guardUrlToken(Request $request): void
    {
        $token = (string) config('whatsapp.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }
    }

    /**
     * TCK-602 (ADR-0051 §5) — signature puis traitement, partagés avec le rejeu : une ligne rejouée
     * repasse par la MÊME vérification `X-Hub-Signature-256`.
     */
    public function process(Request $request, WebhookJournal $journal): JsonResponse
    {
        $this->verifySignature($request);
        // TCK-602 — le jeton et la signature ont passé : la ligne est authentifiée, donc rejouable.
        $journal->authenticated();

        $dispatched = 0;
        $firstId = null;
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
            $dispatched++;
            $firstId ??= $messageId;
        }
        // TCK-602 — l'appariement est fait par la file : le compte est celui des statuts remis.
        $journal->annotate(['external_id' => $firstId, 'matched_count' => $dispatched]);

        // 200 immediately — Meta retries on any non-2xx.
        return new JsonResponse(['ok' => true]);
    }

    /**
     * Verify the `X-Hub-Signature-256` HMAC against the raw request body.
     *
     * P36.08 (TCK-945) — an unset app secret fails closed in EVERY
     * environment: it was skipped outside production, so the URL token alone
     * let an unsigned status through wherever the token was set.
     */
    private function verifySignature(Request $request): void
    {
        $secret = (string) config('whatsapp.webhook_app_secret', '');
        if ($secret === '') {
            Log::error('[whatsapp.webhook] app secret not configured — rejecting unsigned status webhook');
            abort_code(403, 'webhook.signature_not_configured');
        }
        $header = (string) $request->header('X-Hub-Signature-256', '');
        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);
        if ($header === '' || ! hash_equals($expected, $header)) {
            abort_code(403, 'webhook.signature_invalid');
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
     * Le motif écrit sur la tentative : le `code` Meta d'abord, seule partie
     * stable (il distingue un numéro sans WhatsApp d'un gabarit refusé), puis
     * le `title`, ou le `message` à défaut — `131026: Message undeliverable`.
     * Borné aux 255 caractères de la colonne (TCK-1046, P72.06).
     *
     * @param  array<string,mixed>  $status
     */
    private function failureReason(array $status): ?string
    {
        $error = $status['errors'][0] ?? null;
        if (! is_array($error)) {
            return null;
        }

        $code = trim((string) ($error['code'] ?? ''));
        $text = trim((string) ($error['title'] ?? '')) ?: trim((string) ($error['message'] ?? ''));
        $reason = implode(': ', array_filter([$code, $text], fn (string $part) => $part !== ''));

        return mb_substr($reason !== '' ? $reason : 'whatsapp_failed', 0, 255);
    }
}
