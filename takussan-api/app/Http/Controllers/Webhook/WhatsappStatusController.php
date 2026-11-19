<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Pont\Canaux\WhatsappCloud;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TCK-283 — le webhook WhatsApp Cloud (Meta) du numéro des notifications : accusés de remise, et depuis TCK-2980
 * (ADR-0132 § 1) les messages reçus.
 *
 * TCK-2980 (ADR-0132 § 0) — **un ALIAS** de `webhooks/messagerie/whatsapp/{token}` ({@see MessagerieWebhookController}) :
 * l'URL `webhooks/whatsapp/status/{token}` est peut-être déjà déclarée chez Meta, elle passe au pilote
 * {@see WhatsappCloud} par le même chemin (jeton d'URL 404, signature `X-Hub-Signature-256` 403 — secret absent
 * compris —, journal, accusés vers `UpdateWhatsappDeliveryStatusJob`, messages au pont) jusqu'à ce que l'action de
 * déploiement `2026-11-19-ouvrir-le-pont-whatsapp` ait déplacé l'URL de rappel. La garde vit désormais dans le pilote.
 *
 * Forme des accusés :
 * ```
 * { "entry": [ { "changes": [ { "field": "messages", "value": {
 *     "statuses": [ { "id": "wamid.X", "status": "delivered",
 *                     "timestamp": "1700000000", "recipient_id": "221...",
 *                     "errors": [ { "title": "…" } ] } ] } } ] } ] }
 * ```
 */
class WhatsappStatusController extends Controller
{
    public function __construct(private readonly MessagerieWebhookController $messagerie) {}

    public function __invoke(Request $request, WebhookJournal $journal): JsonResponse
    {
        return $this->messagerie->traiter(
            $this->messagerie->garder(WhatsappCloud::NOM, (string) $request->route('token')),
            $request,
            $journal,
        );
    }

    /** P36.05 (TCK-944) — la vérification d'abonnement de Meta, sur le même chemin ; la règle est dans le pilote. */
    public function verify(Request $request): Response
    {
        return $this->messagerie->verify($request, WhatsappCloud::NOM, (string) $request->route('token'));
    }

    /**
     * TCK-602 (ADR-0051 § 5) — le rejeu d'une ligne du journal de cette URL : la même signature, puis le même
     * traitement, sans la garde du jeton (la ligne a été authentifiée à sa réception).
     */
    public function process(Request $request, WebhookJournal $journal): JsonResponse
    {
        return $this->messagerie->traiter(app(WhatsappCloud::class), $request, $journal);
    }
}
