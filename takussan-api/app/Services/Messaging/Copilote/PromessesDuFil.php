<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilPromessesUsage;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Conversation;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2975 (ADR-0131 § 3) — les promesses d'un fil, propres au lecteur qui les demande :
 *
 *  - {@see self::premierNouveau()} : le premier message `all`, lisible, qui n'est pas déjà la source d'un
 *    engagement, écrit APRÈS la dernière extraction réussie du lecteur sur ce fil (`ai_calls.actor_id`). Nul :
 *    rien de neuf, aucun appel ;
 *  - {@see self::garder()} : le filtrage AVANT écriture — message hors de l'entrée ou déjà source d'un
 *    engagement, porteur qui n'est pas un participant actif : écartés ; échéance passée ou illisible : nulle ;
 *  - {@see self::enAttente()} : les promesses en attente du lecteur, sans celles dont le message est devenu
 *    entre-temps la source d'un engagement (un collègue l'a notée).
 */
final class PromessesDuFil
{
    public function __construct(private readonly ConversationAccess $acces) {}

    public function premierNouveau(User $lecteur, Conversation $fil): ?int
    {
        $derniere = AiCall::query()
            ->where('usage_key', FilPromessesUsage::KEY)
            ->where('actor_id', $lecteur->id)
            ->where('subject_type', $fil->getMorphClass())->where('subject_id', $fil->getKey())
            ->whereIn('outcome', [AiCallOutcome::Success->value, AiCallOutcome::CacheHit->value])
            ->where('is_evaluation', false)
            ->max('created_at');

        $requete = $this->acces->messagesLisiblesPar($lecteur, Message::query()->where('messages.conversation_id', $fil->id), $fil)
            ->where('messages.visibility', MessageVisibility::All->value)
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('commitments')->whereColumn('commitments.source_message_id', 'messages.id'))
            // `>=` : `created_at` est à la seconde ; un message de la même seconde que l'appel est relu une fois (le
            // doublon est écarté par `garder()`), jamais manqué.
            ->when($derniere !== null, fn ($q) => $q->where('messages.created_at', '>=', $derniere));

        $id = $requete->min('messages.id');

        return $id !== null ? (int) $id : null;
    }

    /**
     * @param  list<int>  $ids  les messages de l'entrée (tous `all`, aucun source d'un engagement)
     * @return list<array{message_id: int, porteur_id: int, libelle: string, echeance: string|null}>
     */
    public function garder(mixed $promesses, array $ids, Conversation $fil, User $lecteur): array
    {
        if (! is_array($promesses)) {
            return [];
        }
        // Un message dont le lecteur a déjà une promesse proposée (décidée ou non) n'en propose pas une seconde.
        $dejaProposes = $this->sesSuggestions($lecteur, $fil)
            ->pluck(DB::raw("(ai_suggestions.proposal->>'message_id')::bigint as m"))->map(fn ($m) => (int) $m)->all();
        $connus = array_diff_key(array_flip($ids), array_flip($dejaProposes));
        $participants = array_flip($fil->participants()->wherePivotNull('left_at')->pluck('users.id')->map(fn ($id) => (int) $id)->all());

        $gardees = [];
        foreach ($promesses as $p) {
            $message = is_array($p) ? ($p['message_id'] ?? null) : null;
            $porteur = is_array($p) ? ($p['porteur_id'] ?? null) : null;
            $libelle = is_array($p) ? ($p['libelle'] ?? null) : null;
            if (! is_int($message) || ! is_int($porteur) || ! is_string($libelle) || trim($libelle) === ''
                || ! isset($connus[$message]) || ! isset($participants[$porteur])) {
                continue;
            }
            $gardees[] = [
                'message_id' => $message,
                'porteur_id' => $porteur,
                'libelle' => mb_substr(trim($libelle), 0, 160),
                'echeance' => self::echeance($p['echeance'] ?? null),
            ];
        }

        return $gardees;
    }

    /** @return list<array{suggestion_id: int, proposition: array<string, mixed>}> */
    public function enAttente(User $lecteur, Conversation $fil): array
    {
        return $this->sesSuggestions($lecteur, $fil)
            ->where('ai_suggestions.decision', AiSuggestionDecision::Pending->value)
            ->whereRaw("ai_suggestions.proposal <> '[]'::jsonb")
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('commitments')
                ->whereRaw("commitments.source_message_id = (ai_suggestions.proposal->>'message_id')::bigint"))
            ->orderBy('ai_suggestions.id')
            ->limit(50)
            ->get(['ai_suggestions.id', 'ai_suggestions.proposal'])
            ->map(fn (AiSuggestion $s) => ['suggestion_id' => (int) $s->id, 'proposition' => $s->proposal])
            ->all();
    }

    /** Les suggestions `fil.promesses` du lecteur sur ce fil. */
    private function sesSuggestions(User $lecteur, Conversation $fil)
    {
        return AiSuggestion::query()
            ->join('ai_calls', 'ai_calls.id', '=', 'ai_suggestions.ai_call_id')
            ->where('ai_calls.actor_id', $lecteur->id)
            ->where('ai_suggestions.usage_key', FilPromessesUsage::KEY)
            ->where('ai_suggestions.subject_type', $fil->getMorphClass())->where('ai_suggestions.subject_id', $fil->getKey());
    }

    /** ISO 8601 à venir, sinon nul (le lot 3 refuse une échéance passée : `commitment.due_in_past`). */
    private static function echeance(mixed $valeur): ?string
    {
        if (! is_string($valeur) || trim($valeur) === '') {
            return null;
        }
        try {
            $date = CarbonImmutable::parse($valeur);
        } catch (Throwable) {
            return null;
        }

        return $date->isFuture() ? $date->toAtomString() : null;
    }
}
