<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Radar\Whatsapp\RadarWhatsappInbox;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2395 (ADR-0077 §5) — le webhook du numéro du Radar : les messages que les annonceurs lui écrivent. Gardé comme
 * celui des notifications ({@see WhatsappStatusController}), mais par les secrets du Radar (`config/radar_whatsapp.php`) :
 * jeton d'URL (404), signature `X-Hub-Signature-256` sous le secret de l'application Meta du Radar (403, et 403 aussi
 * sans secret configuré, quel que soit l'environnement). Le journal des webhooks (`webhook.journal`) a écrit sa ligne
 * avant ce contrôleur ; elle n'est authentifiée, donc rejouable, qu'après la signature.
 *
 * Les accusés de livraison des messages du Radar arrivent aussi ici ; ils ne sont pas lus (TCK-2427). Meta reçoit 200
 * dès que les messages sont rangés : il rejoue sur toute autre réponse.
 */
class RadarWhatsappWebhookController extends Controller
{
    public function __invoke(Request $request, WebhookJournal $journal, RadarWhatsappInbox $inbox): JsonResponse
    {
        $this->guardUrlToken($request);

        return $this->process($request, $journal, $inbox);
    }

    /** La vérification d'abonnement de Meta (`hub.challenge`), sous le jeton de vérification du Radar. */
    public function verify(Request $request): Response
    {
        $this->guardUrlToken($request);

        $expected = (string) config('radar_whatsapp.webhook_verify_token', '');
        $candidate = (string) $request->query('hub_verify_token', '');
        if ($request->query('hub_mode') !== 'subscribe' || $expected === '' || ! hash_equals($expected, $candidate)) {
            abort_code(403, 'webhook.verify_token_invalid');
        }

        return new Response((string) $request->query('hub_challenge', ''), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    /** La signature puis le traitement, partagés avec le rejeu (`WebhookReplayer`), qui repasse par la MÊME signature. */
    public function process(Request $request, WebhookJournal $journal, RadarWhatsappInbox $inbox): JsonResponse
    {
        $this->verifySignature($request);
        $journal->authenticated();

        $received = $inbox->receive((array) $request->input('entry', []));
        $journal->annotate(['external_id' => $received['first_id'], 'event_type' => 'messages', 'matched_count' => $received['recorded']]);

        return new JsonResponse(['ok' => true]);
    }

    private function guardUrlToken(Request $request): void
    {
        $token = (string) config('radar_whatsapp.webhook_url_token', '');
        if ($token === '' || ! hash_equals($token, (string) $request->route('token'))) {
            abort(404);
        }
    }

    private function verifySignature(Request $request): void
    {
        $secret = (string) config('radar_whatsapp.webhook_app_secret', '');
        if ($secret === '') {
            Log::error('[radar.whatsapp.webhook] app secret not configured — rejecting unsigned message webhook');
            abort_code(403, 'webhook.signature_not_configured');
        }
        $header = (string) $request->header('X-Hub-Signature-256', '');
        $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), $secret);
        if ($header === '' || ! hash_equals($expected, $header)) {
            abort_code(403, 'webhook.signature_invalid');
        }
    }
}
