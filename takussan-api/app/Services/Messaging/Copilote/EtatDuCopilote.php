<?php

namespace App\Services\Messaging\Copilote;

use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Conversation;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiRefusalReason;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-2974 (ADR-0131 § 3) — l'état du copilote pour (lecteur, fil, sorte), DÉRIVÉ, sans table neuve :
 *
 *  - `en_cours` : la marque de cache posée au dépôt du job ({@see self::marquer()}), 120 s ; elle sert aussi de
 *    verrou contre une seconde demande identique ;
 *  - `refusee` / `echec` : le DERNIER `ai_calls` du lecteur pour cet usage et ce fil, s'il n'est pas un succès,
 *    s'il est postérieur à sa dernière proposition et journalisé le jour civil courant (les plafonds sont
 *    journaliers, `AiBudget` : `now()->startOfDay()`). Hier « budget épuisé », aujourd'hui `aucun` ;
 *  - `prete` : sa dernière `AiSuggestion` de l'usage pour ce fil (`ai_calls.actor_id` = lui), non purgée ;
 *  - sinon `aucun`.
 *
 * Tout se compare sur les identifiants (`ai_calls.id`), jamais sur `created_at` (à la seconde). Le résumé d'un
 * agent n'est lu par personne d'autre : chaque requête porte `actor_id` = le lecteur. La garde est rejugée par
 * l'appelant à chaque lecture.
 */
final class EtatDuCopilote
{
    public const AUCUN = 'aucun';

    public const EN_COURS = 'en_cours';

    public const PRETE = 'prete';

    public const REFUSEE = 'refusee';

    public const ECHEC = 'echec';

    public const DUREE_DE_LA_MARQUE = 120;

    public function __construct(private readonly ReglagesDuCopilote $reglages) {}

    /** @return array<string, mixed> */
    public function de(User $lecteur, Conversation $fil, string $sorte, ?Agency $agence): array
    {
        $usage = SortesDuCopilote::usageDe($sorte);

        $reglage = $this->reglages->etat($sorte, $agence);
        if (! $reglage['active']) {
            return ['statut' => self::REFUSEE, 'code' => 'copilote.coupe', 'portee' => $reglage['raison']];
        }
        if (Cache::has(self::cleDeLaMarque($lecteur, $fil, $sorte))) {
            return ['statut' => self::EN_COURS];
        }

        $suggestion = $this->derniereSuggestion($lecteur, $fil, $usage);
        $appel = AiCall::query()
            ->where('usage_key', $usage)
            ->where('actor_id', $lecteur->id)
            ->where('subject_type', $fil->getMorphClass())->where('subject_id', $fil->getKey())
            ->where('is_evaluation', false)
            ->orderByDesc('id')
            ->first();

        if ($appel !== null
            && $appel->outcome !== AiCallOutcome::Success
            && $appel->outcome !== AiCallOutcome::CacheHit
            && ($suggestion === null || (int) $appel->id > (int) $suggestion->ai_call_id)
            && $appel->created_at !== null && $appel->created_at->gte(now()->startOfDay())) {
            return $appel->outcome === AiCallOutcome::Refused
                ? ['statut' => self::REFUSEE, 'code' => self::codeDuRefus($appel->refusal_reason)]
                : ['statut' => self::ECHEC, 'code' => 'copilote.echec'];
        }

        if ($sorte === SortesDuCopilote::PROMESSES) {
            // TCK-2975 — une suggestion par promesse : la liste des promesses en attente du lecteur, sans celles
            // qu'un collègue a notées depuis (`PromessesDuFil::enAttente()`).
            $promesses = app(PromessesDuFil::class)->enAttente($lecteur, $fil);

            return ['statut' => $promesses === [] ? self::AUCUN : self::PRETE, 'promesses' => $promesses];
        }

        if ($suggestion !== null && $suggestion->proposal !== []) {
            return ['statut' => self::PRETE, 'suggestion_id' => (int) $suggestion->id, 'proposition' => $suggestion->proposal];
        }

        return ['statut' => self::AUCUN];
    }

    /** La dernière proposition du lecteur pour cet usage et ce fil (quelle qu'en soit la fenêtre). */
    public function derniereSuggestion(User $lecteur, Conversation $fil, string $usage): ?AiSuggestion
    {
        return $this->sesSuggestions($lecteur, $fil, $usage)->orderByDesc('ai_suggestions.id')->first();
    }

    /** La proposition prête du lecteur pour CETTE fenêtre de résumé, s'il y en a une (idempotence). */
    public function resumeDeLaFenetre(User $lecteur, Conversation $fil, int $depuisId, int $jusquaId): ?AiSuggestion
    {
        return $this->sesSuggestions($lecteur, $fil, SortesDuCopilote::usageDe(SortesDuCopilote::RESUME))
            ->whereRaw("(ai_suggestions.proposal->>'depuis_message_id')::bigint = ?", [$depuisId])
            ->whereRaw("(ai_suggestions.proposal->>'jusqu_a_message_id')::bigint = ?", [$jusquaId])
            ->orderByDesc('ai_suggestions.id')
            ->first();
    }

    /** Pose la marque « en cours » ; faux si elle l'était déjà (une demande identique tourne). */
    public static function marquer(User|int $lecteur, Conversation|int $fil, string $sorte): bool
    {
        return Cache::add(self::cleDeLaMarque($lecteur, $fil, $sorte), true, self::DUREE_DE_LA_MARQUE);
    }

    public static function lever(User|int $lecteur, Conversation|int $fil, string $sorte): void
    {
        Cache::forget(self::cleDeLaMarque($lecteur, $fil, $sorte));
    }

    public static function codeDuRefus(?AiRefusalReason $raison): string
    {
        return match ($raison) {
            AiRefusalReason::KillSwitch => 'copilote.coupe',
            AiRefusalReason::Budget => 'copilote.budget_epuise',
            AiRefusalReason::Forbidden => 'copilote.indisponible',
            default => 'copilote.echec',
        };
    }

    private static function cleDeLaMarque(User|int $lecteur, Conversation|int $fil, string $sorte): string
    {
        $l = $lecteur instanceof User ? $lecteur->id : $lecteur;
        $f = $fil instanceof Conversation ? $fil->id : $fil;

        return "copilote:en_cours:{$l}:{$f}:{$sorte}";
    }

    private function sesSuggestions(User $lecteur, Conversation $fil, string $usage)
    {
        return AiSuggestion::query()
            ->select('ai_suggestions.*')
            ->join('ai_calls', 'ai_calls.id', '=', 'ai_suggestions.ai_call_id')
            ->where('ai_calls.actor_id', $lecteur->id)
            ->where('ai_suggestions.usage_key', $usage)
            ->where('ai_suggestions.subject_type', $fil->getMorphClass())
            ->where('ai_suggestions.subject_id', $fil->getKey())
            ->whereRaw("ai_suggestions.proposal <> '[]'::jsonb");
    }
}
