<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Services\Pont\AccusesDuPont;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\PontEntrant;
use App\Services\Pont\RegistreDesCanaux;
use App\Services\Webhooks\WebhookJournal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * TCK-2980 (ADR-0132 § 0) — LE webhook de la messagerie, un par canal : `POST|GET /api/webhooks/messagerie/{canal}/{token}`,
 * sur le patron de `webhooks/payments/{provider}/{token}`.
 *
 * 1. le registre résout le canal ({@see RegistreDesCanaux::recepteur()}) : inconnu, inactif ou sans la capacité
 *    « reçoit » → 404 ;
 * 2. le jeton d'URL du canal ({@see CanalDuPont::jetonDuWebhook()}) : absent ou différent → 404 (temps constant) ;
 * 3. le pilote vérifie la signature ({@see CanalDuPont::verifierWebhook()}) → 403 ; RIEN n'est lu avant ;
 * 4. le journal tient la ligne pour authentifiée (rejouable), puis le pilote lit ({@see CanalDuPont::lireWebhook()}) :
 *    les accusés à leur traitement, les messages au pont ({@see PontEntrant::recevoir()}).
 *
 * Le journal des webhooks s'ouvre avant (`webhook.journal:messagerie`, fournisseur = le canal). L'ancienne URL de
 * WhatsApp (`webhooks/whatsapp/status/{token}`) reste un alias ({@see WhatsappStatusController}) jusqu'à ce que
 * l'action de déploiement ait déplacé l'URL de rappel chez Meta. Répond 200 dès que c'est rangé : un fournisseur
 * rejoue tout non-2xx, et l'idempotence est celle du pont.
 */
class MessagerieWebhookController extends Controller
{
    public function __construct(
        private readonly RegistreDesCanaux $registre,
        private readonly PontEntrant $pont,
        // TCK-2981
        private readonly AccusesDuPont $accuses,
    ) {}

    public function __invoke(Request $request, WebhookJournal $journal, string $canal, string $token): JsonResponse
    {
        return $this->traiter($this->garder($canal, $token), $request, $journal);
    }

    /** La vérification d'abonnement du fournisseur (`GET`), sous la même garde ; hors du journal. */
    public function verify(Request $request, string $canal, string $token): Response
    {
        $defi = $this->garder($canal, $token)->defiDAbonnement($request);
        abort_if($defi === null, 404);

        return new Response($defi, 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    /** Le canal du `{canal}` de l'URL, gardé par son jeton : 404 pour tout ce qui n'est pas un récepteur au bon jeton. */
    public function garder(string $nom, string $token): CanalDuPont
    {
        $canal = $this->registre->recepteur($nom);
        $attendu = $canal?->jetonDuWebhook() ?? '';
        if ($canal === null || $attendu === '' || ! hash_equals($attendu, $token)) {
            abort(404);
        }

        return $canal;
    }

    /**
     * TCK-602 (ADR-0051 § 5) — signature puis traitement, partagés avec le rejeu : une ligne rejouée repasse par la
     * MÊME vérification du pilote.
     */
    public function traiter(CanalDuPont $canal, Request $request, WebhookJournal $journal): JsonResponse
    {
        $canal->verifierWebhook($request);
        $journal->authenticated();

        $lecture = $canal->lireWebhook($request);
        $appliques = $canal->appliquerAccuses($lecture->accuses);
        // TCK-2981 — les mêmes accusés sur les relais du pont (et le repli tardif d'un relais échoué).
        $this->accuses->appliquer($canal, $lecture->accuses);
        $premierAccuse = $lecture->accuses[0]->identifiant ?? null;
        $recus = $this->pont->recevoir($canal, $lecture->entrants);

        // Le journal dit ce qui a été lu : des messages (comme le Radar), sinon des accusés (l'annotation d'avant).
        $journal->annotate($recus['received'] > 0
            ? ['external_id' => $recus['first_id'] ?? $premierAccuse, 'event_type' => 'messages', 'matched_count' => $appliques + $recus['recorded']]
            : ['external_id' => $premierAccuse, 'matched_count' => $appliques]);

        return new JsonResponse(['ok' => true]);
    }
}
