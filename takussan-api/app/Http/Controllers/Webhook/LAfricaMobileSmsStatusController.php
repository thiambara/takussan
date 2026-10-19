<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Notifications\Sms\DeliveryAttemptUpdater;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsWebhookUrlToken;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * TCK-102 — Inbound DLR from LAfricaMobile (LAMPUSH v2.3).
 *
 * Note: LAM uses a GET callback (not POST). Query params:
 *   push_id, ret_id, to, status, text.
 * Status codes: SENT=4, DELIVRD=6, EXPIRED=12, UNKNOWN=16,
 *   REJECTD=23, UNDELIVERED=2.
 *
 * The route includes the AppNotification id passed at send time
 * (per-message ret_url), the random URL token, AND the Laravel
 * signed-route guard.
 *
 * P36.01 (TCK-795) — LAM AJOUTE ses paramètres au `ret_url` que nous avons
 * signé : la signature ne couvre que ce que nous avons signé (jeton,
 * notification, expiration), et ces paramètres-là sont exclus de la
 * vérification, ici comme dans le middleware `signed` de la route.
 */
class LAfricaMobileSmsStatusController extends Controller
{
    /** Paramètres que LAM ajoute au `ret_url` au rappel (LAMPUSH v2.3). */
    public const LAM_QUERY_PARAMS = ['push_id', 'ret_id', 'to', 'status', 'text'];

    /**
     * P36.03 (TCK-797) — les seuls statuts écrits. SENT (4) est l'état de la tentative à l'envoi :
     * il n'annonce aucun échec, et la précédence (TCK-796) l'empêche d'effacer un `delivered`.
     * UNKNOWN (16), un statut absent ou inconnu ne sont pas sûrement terminaux : ignorés, avec
     * un `Log::warning`, au lieu d'un `failed` par défaut.
     */
    private const STATUSES = [
        6 => SmsResult::STATUS_DELIVERED,
        4 => SmsResult::STATUS_SENT,
        2 => SmsResult::STATUS_FAILED,
        12 => SmsResult::STATUS_FAILED,
        23 => SmsResult::STATUS_FAILED,
    ];

    public function __invoke(Request $request, DeliveryAttemptUpdater $updater, WebhookJournal $journal): JsonResponse
    {
        // P36.04 (TCK-943) — le jeton propre au fournisseur, sinon la clé commune.
        if (! SmsWebhookUrlToken::accepts('lafricamobile', (string) $request->route('token'), config())) {
            abort(404);
        }
        if (! $request->hasValidSignatureWhileIgnoring(self::LAM_QUERY_PARAMS)) {
            abort_code(403, 'webhook.signature_invalid');
        }
        // TCK-602 — l'IP (`restrict.ip`), le jeton et la signature d'URL ont passé.
        $journal->authenticated();

        $notificationId = $request->route('notification');

        return $this->process($request, $updater, $journal, is_numeric($notificationId) ? (int) $notificationId : null);
    }

    /**
     * TCK-602 (ADR-0051 §5) — le traitement d'un accusé AUTHENTIFIÉ, partagé avec le rejeu. Le
     * rejeu ne connaît pas l'identifiant de notification de l'URL (le chemin n'est pas journalisé) :
     * l'appariement se fait alors par `push_id` seul.
     */
    public function process(Request $request, DeliveryAttemptUpdater $updater, WebhookJournal $journal, ?int $notificationId = null): JsonResponse
    {
        $pushId = (string) $request->query('push_id', '');
        $statusCode = (int) $request->query('status', -1);
        $statusText = (string) $request->query('text', '');
        if ($pushId === '') {
            abort(404);
        }
        $journal->annotate(['external_id' => $pushId, 'event_type' => (string) $statusCode]);
        $newStatus = self::STATUSES[$statusCode] ?? null;
        if ($newStatus === null) {
            Log::warning('[sms.lam.webhook] statut non terminal ou inconnu ignoré', ['push_id' => $pushId, 'status' => $statusCode, 'text' => $statusText]);
            $journal->annotate(['matched_count' => 0]);

            return new JsonResponse(['ok' => true]);
        }
        $deliveredAt = $newStatus === SmsResult::STATUS_DELIVERED ? now() : null;
        $updated = $updater->applyStatus(
            provider: 'lafricamobile',
            providerMessageId: $pushId,
            newStatus: $newStatus,
            hintNotificationId: $notificationId,
            failureReason: $newStatus === SmsResult::STATUS_FAILED ? $statusText : null,
            deliveredAt: $deliveredAt,
            statusPrecedence: DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE,
        );
        if (! $updated) {
            $journal->unmatched();
            abort(404);
        }
        $journal->annotate(['matched_count' => 1]);

        return new JsonResponse(['ok' => true]);
    }
}
