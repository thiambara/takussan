<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Conversation\CopiloteRequest;
use App\Http\Requests\Conversation\DemanderAuCopiloteRequest;
use App\Jobs\Copilote\DemanderAuCopilote;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\Copilote\EtatDuCopilote;
use App\Services\Messaging\Copilote\PromessesDuFil;
use App\Services\Messaging\Copilote\ReglagesDuCopilote;
use App\Services\Messaging\Copilote\SortesDuCopilote;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\NonLus;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2974 (ADR-0131 § 3) — le copilote d'un fil. Aucun appel au modèle ici : la demande dépose un job de la
 * file `ai` ({@see DemanderAuCopilote}) et rend `202` ; l'état se relit par `GET`.
 *
 * La garde est jugée par la requête ({@see CopiloteRequest}) avant tout ; puis l'interrupteur
 * ({@see ReglagesDuCopilote} : `409 copilote.coupe`) ; puis, pour `resume`, la fenêtre et son seuil
 * (`422 copilote.resume_inutile`), sans appel. Un résumé déjà prêt pour la même fenêtre est rendu (`200`) sans
 * appel ; une demande identique en cours ne dépose pas un second job. Un refus ou un échec passé ne bloque
 * jamais une nouvelle demande.
 */
class ConversationCopiloteController extends Controller
{
    public function demander(
        DemanderAuCopiloteRequest $request,
        Conversation $conversation,
        string $sorte,
        ReglagesDuCopilote $reglages,
        EtatDuCopilote $etat,
    ): JsonResponse {
        $user = $request->user();
        $agence = Agency::query()->find(EquipeDuFil::agence($conversation));
        abort_code_unless($reglages->etat($sorte, $agence)['active'], 409, 'copilote.coupe');

        if ($sorte === SortesDuCopilote::PROMESSES) {
            // TCK-2975 — rien de neuf depuis la dernière extraction du lecteur : l'état courant, sans appel.
            $depuis = app(PromessesDuFil::class)->premierNouveau($user, $conversation);
            if ($depuis === null) {
                return $this->json(['data' => $etat->de($user, $conversation, $sorte, $agence)]);
            }
            $this->lancer($request, $conversation, $sorte, ['depuis_message_id' => $depuis], []);

            return $this->json(['data' => $etat->de($user, $conversation, $sorte, $agence)], 202);
        }

        if ($sorte !== SortesDuCopilote::RESUME) {
            // TCK-2975 — une question, un brouillon : chaque demande est une demande à elle (pas d'idempotence) ;
            // la marque « en cours » empêche seulement deux demandes simultanées de la même sorte sur ce fil.
            $demande = $sorte === SortesDuCopilote::QUESTION
                ? ['question' => (string) $request->validated('question')]
                : ['ton' => (string) ($request->validated('ton') ?? 'normal')];
            $this->lancer($request, $conversation, $sorte, [], $demande);

            return $this->json(['data' => $etat->de($user, $conversation, $sorte, $agence)], 202);
        }

        $fenetre = $this->fenetreDuResume($user, $conversation, (int) $request->validated('depuis_message_id'), $reglages->seuilDuResume());

        $pret = $etat->resumeDeLaFenetre($user, $conversation, $fenetre['depuis_message_id'], $fenetre['jusqu_a_message_id']);
        if ($pret !== null) {
            return $this->json(['data' => ['statut' => EtatDuCopilote::PRETE, 'suggestion_id' => (int) $pret->id, 'proposition' => $pret->proposal]]);
        }

        $this->lancer($request, $conversation, $sorte, $fenetre, []);

        return $this->json(['data' => $etat->de($user, $conversation, $sorte, $agence)], 202);
    }

    /**
     * Pose la marque « en cours » et confie la demande au job, avec le profil actif du lecteur ; rien si la même
     * demande tourne déjà.
     *
     * @param  array<string, int>  $fenetre
     * @param  array<string, string>  $demande
     */
    private function lancer(DemanderAuCopiloteRequest $request, Conversation $conversation, string $sorte, array $fenetre, array $demande): void
    {
        if (! EtatDuCopilote::marquer($request->user(), $conversation, $sorte)) {
            return;
        }
        $profil = $request->activeProfile();
        DemanderAuCopilote::dispatch(
            (int) $request->user()->id, (int) $conversation->id, $sorte, $fenetre,
            $profil?->getMorphClass(), $profil?->getKey() !== null ? (int) $profil->getKey() : null,
            $demande,
        );
    }

    public function etat(CopiloteRequest $request, Conversation $conversation, EtatDuCopilote $etat): JsonResponse
    {
        $agence = Agency::query()->find(EquipeDuFil::agence($conversation));
        $sortes = [];
        foreach (SortesDuCopilote::sortes() as $sorte) {
            $sortes[$sorte] = $etat->de($request->user(), $conversation, $sorte, $agence);
        }

        return $this->json(['data' => ['conversation_id' => (int) $conversation->id, 'sortes' => $sortes]]);
    }

    /**
     * La fenêtre d'un résumé : de `depuis_message_id` (un message de CE fil que le lecteur lit) au dernier
     * message qu'il lit. Au moins `ReglagesDuCopilote::seuilDuResume()` messages comptés (règle de `NonLus`, hors les
     * siens), sinon 422.
     *
     * @return array{depuis_message_id: int, jusqu_a_message_id: int}
     */
    private function fenetreDuResume(User $user, Conversation $conversation, int $depuis, int $seuil): array
    {
        $acces = app(ConversationAccess::class);
        $lisibles = fn () => $acces->messagesLisiblesPar($user, Message::query()->where('messages.conversation_id', $conversation->id), $conversation);

        abort_code_unless($lisibles()->whereKey($depuis)->exists(), 422, 'copilote.resume_inutile');
        $comptes = NonLus::comptentPour($lisibles()->where('messages.id', '>=', $depuis), $user)->count();
        abort_code_unless($comptes >= $seuil, 422, 'copilote.resume_inutile');

        return ['depuis_message_id' => $depuis, 'jusqu_a_message_id' => (int) $lisibles()->max('messages.id')];
    }
}
