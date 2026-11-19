<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Conversation;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiRefusalReason;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use App\Support\ImpersonationContext;
use Illuminate\Support\Facades\Cache;

/**
 * TCK-2976 (ADR-0131 § 7) — l'état de la transcription des notes vocales d'un fil, DÉRIVÉ, sans table neuve, et EN LOT
 * pour une page (un nombre de requêtes qui ne dépend pas du nombre de notes) :
 *
 *  - `prete` : la dernière `AiSuggestion` `fil.transcription` du message (une par message, partagée par le personnel) ;
 *  - `en_cours` : la marque de cache posée au dépôt du job ({@see self::marquer()}) ;
 *  - `indisponible` / `ai.role_unassigned` ou `copilote.coupe` : lus sur les RÉGLAGES à chaque lecture
 *    ({@see ReglagesDuCopilote::etat()}), jamais sur un appel passé — le rôle affecté ou la fonction rallumée, les notes
 *    repassent à `aucune` ;
 *  - `indisponible` / `copilote.budget_epuise` ou `copilote.echec` : le dernier `ai_calls` du message, s'il n'est pas un
 *    succès et a été journalisé le jour civil courant ;
 *  - sinon `aucune`.
 *
 * Qui le lit : le seul lecteur servi par la garde du copilote ({@see self::sertLeLecteur()}).
 */
final class TranscriptionsDuFil
{
    public const AUCUNE = 'aucune';

    public const EN_COURS = 'en_cours';

    public const PRETE = 'prete';

    public const INDISPONIBLE = 'indisponible';

    public const DUREE_DE_LA_MARQUE = 120;

    public function __construct(
        private readonly ReglagesDuCopilote $reglages,
        private readonly GardeDuCopilote $garde,
    ) {}

    /** La garde du copilote ET sa capacité, hors impersonation : qui reçoit la clé `transcription`. */
    public function sertLeLecteur(?User $lecteur, Conversation $fil): bool
    {
        return $lecteur !== null
            && ! app(ImpersonationContext::class)->active()
            && $this->garde->autorise($lecteur, $fil);
    }

    /**
     * @param  list<int>  $ids  des messages `audio` du fil
     * @return array<int, array<string, mixed>> identifiant => `{etat, texte?, langue?, code?}`
     */
    public function etats(Conversation $fil, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $agenceId = EquipeDuFil::agence($fil);
        $reglage = $this->reglages->etat(ReglagesDuCopilote::TRANSCRIPTION, $agenceId === null ? null : Agency::query()->find($agenceId));
        $morph = (new Message)->getMorphClass();

        $suggestions = AiSuggestion::query()
            ->where('usage_key', FilTranscriptionUsage::KEY)
            ->where('subject_type', $morph)->whereIn('subject_id', $ids)
            ->whereRaw("proposal <> '[]'::jsonb")
            ->orderByDesc('id')->get()->unique('subject_id')->keyBy('subject_id');
        $appels = AiCall::query()
            ->where('usage_key', FilTranscriptionUsage::KEY)
            ->where('subject_type', $morph)->whereIn('subject_id', $ids)
            ->where('is_evaluation', false)
            ->where('created_at', '>=', now()->startOfDay())
            ->orderByDesc('id')->get()->unique('subject_id')->keyBy('subject_id');
        $marques = Cache::many(array_map(self::cleDeLaMarque(...), $ids));

        $etats = [];
        foreach ($ids as $id) {
            $suggestion = $suggestions->get($id);
            if ($suggestion !== null) {
                $etats[$id] = ['etat' => self::PRETE, 'texte' => (string) ($suggestion->proposal['texte'] ?? ''), 'langue' => $suggestion->proposal['langue'] ?? null];
            } elseif (! empty($marques[self::cleDeLaMarque($id)])) {
                $etats[$id] = ['etat' => self::EN_COURS];
            } elseif (! $reglage['active']) {
                $etats[$id] = ['etat' => self::INDISPONIBLE, 'code' => $reglage['raison'] === ReglagesDuCopilote::NON_CONFIGUREE ? 'ai.role_unassigned' : 'copilote.coupe'];
            } else {
                $code = self::codeDeLAppel($appels->get($id));
                $etats[$id] = $code === null ? ['etat' => self::AUCUNE] : ['etat' => self::INDISPONIBLE, 'code' => $code];
            }
        }

        return $etats;
    }

    /** Pose la marque « en cours » ; faux si elle l'était déjà (une transcription de ce message tourne). */
    public static function marquer(int $messageId): bool
    {
        return Cache::add(self::cleDeLaMarque($messageId), true, self::DUREE_DE_LA_MARQUE);
    }

    public static function lever(int $messageId): void
    {
        Cache::forget(self::cleDeLaMarque($messageId));
    }

    /**
     * Un refus de budget ou un échec du jour. Un rôle vide ou un coupe-circuit passés ne se lisent PAS ici : ils se
     * lisent sur les réglages, à chaque lecture.
     */
    private static function codeDeLAppel(?AiCall $appel): ?string
    {
        if ($appel === null || $appel->outcome === AiCallOutcome::Success || $appel->outcome === AiCallOutcome::CacheHit) {
            return null;
        }
        if ($appel->outcome === AiCallOutcome::Refused) {
            return match ($appel->refusal_reason) {
                AiRefusalReason::Budget => 'copilote.budget_epuise',
                AiRefusalReason::KillSwitch => null,
                default => 'copilote.echec',
            };
        }

        return $appel->error_code === 'ai.role_unassigned' ? null : 'copilote.echec';
    }

    private static function cleDeLaMarque(int $messageId): string
    {
        return "copilote:transcription:en_cours:{$messageId}";
    }
}
