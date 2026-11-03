<?php

namespace App\Services\Radar;

use App\Ai\Usages\RadarConsentVerificationUsage;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\RadarConsent;
use App\Models\User;
use App\Services\Ai\SuggestionRecorder;

/**
 * TCK-2388 (ADR-0076 §7, ADR-0077 §3) — la suggestion `radar.verification_accord` d'une réponse se décide AVEC l'issue
 * que l'humain a tranchée : `accepted` quand l'issue est celle du classement du modèle (`consent` ↔ `consented`,
 * `refusal` ↔ `refused`, `stop`, `question`), `edited` avec `{classification: <issue humaine>}` sinon — `ambiguous`
 * est donc toujours `edited` ; `no_answer`, hors du vocabulaire du modèle, la `rejected`. C'est la mesure de ce que vaut la vérification.
 *
 * Deux écrivains, une seule fonction : `recordOutcome()` décide la suggestion que le job a laissée en attente, et le
 * job décide celle qu'il vient d'écrire quand l'issue a été posée PENDANT son appel. Chacun tient le verrou de la
 * réponse ; la suggestion se décide une fois (`SuggestionRecorder`), aucun des deux ne réécrit une décision humaine.
 */
final class RadarVerificationDecision
{
    /** L'issue humaine, dans le vocabulaire du classement. */
    private const CLASSIFICATION_OF = [
        'consented' => 'consent',
        'refused' => 'refusal',
        'stop' => 'stop',
        'question' => 'question',
    ];

    public function __construct(private readonly SuggestionRecorder $recorder) {}

    /** Décide la suggestion en attente de cette réponse contre cette issue ; rend la suggestion, ou null s'il n'y en a pas. */
    public function decide(RadarConsent $reply, RadarOutreachOutcome $outcome, User $by): ?AiSuggestion
    {
        $suggestion = AiSuggestion::query()
            ->where('usage_key', RadarConsentVerificationUsage::KEY)
            ->where('subject_type', $reply->getMorphClass())
            ->where('subject_id', $reply->getKey())
            ->where('decision', AiSuggestionDecision::Pending->value)
            ->latest('id')
            ->first();
        if ($suggestion === null) {
            return null;
        }

        // « Sans réponse » n'a pas d'équivalent dans le vocabulaire du modèle : la suggestion est REJETÉE (aucune valeur finale),
        // l'humain dit que la réponse déposée n'en est pas une.
        if ($outcome === RadarOutreachOutcome::NoAnswer) {
            return $this->recorder->reject($suggestion, $by);
        }

        return $this->recorder->edit($suggestion, ['classification' => self::CLASSIFICATION_OF[$outcome->value]] + $suggestion->proposal, $by);
    }

    /**
     * Pour le job : l'issue du message a-t-elle déjà été posée SUR CETTE RÉPONSE ? Oui quand elle date de la réponse ou
     * d'après (une issue plus ancienne — un `question` avant un nouveau dépôt — ne juge pas une réponse que l'humain n'a
     * pas encore vue). Alors la suggestion qu'on vient d'écrire se décide, par celui qui a posé l'issue.
     */
    public function decideIfOutcomeKnown(RadarConsent $reply): ?AiSuggestion
    {
        $outreach = $reply->outreach()->first();
        if ($outreach === null || $outreach->outcome === null || $outreach->outcome_at === null || $outreach->outcome_at->lt($reply->created_at)) {
            return null;
        }
        $by = $outreach->outcomeBy()->first();

        return $by === null ? null : $this->decide($reply, $outreach->outcome, $by);
    }
}
