<?php

namespace App\Services\Radar;

use App\Ai\Usages\RadarExtractionUsage;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\SuggestionRecorder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2387 (ADR-0077 §5) — la relecture d'une fiche extraite : corriger un champ, puis valider.
 *
 * **Corriger ne décide rien.** Le geste réécrit `extracted` (valeur, `corrected: true`, drapeaux levés) et
 * laisse la suggestion en attente : l'opérateur peut corriger dix fois, la décision (ADR-0076 §7) se prend
 * une seule, à la validation — `accepted` si rien n'a bougé, `edited` avec le différentiel exact sinon.
 *
 * **Chaque geste relit l'annonce sous `lockForUpdate`**, dans une transaction courte : deux validations
 * simultanées ne passent pas toutes deux (la seconde lit `reviewed` et reçoit 409), et une correction ne
 * s'écrit pas sur une fiche validée entre-temps. Ordre des verrous quand un geste en touche deux :
 * l'annonce, puis l'annonceur (TCK-2386).
 *
 * **Le journal nomme les champs, jamais leurs valeurs** : une correction de téléphone ou de description
 * est une donnée personnelle, le journal est lu par plus de monde que la fiche.
 */
final class RadarListingReview
{
    public function __construct(
        private readonly SuggestionRecorder $recorder,
        private readonly RadarMatcher $matcher,
    ) {}

    /**
     * @param  array<string, mixed>  $changes  clés de {@see RadarReviewFields::EDITABLE}
     */
    public function correct(RadarListing $listing, array $changes, User $by): RadarListing
    {
        return $this->locked($listing, function (RadarListing $l) use ($changes, $by): void {
            abort_code_unless($l->stage->allowsCorrection(), 409, 'radar.listing.stage_conflict', ['stage' => $l->stage->value]);

            $l->extracted = RadarReviewFields::apply($l->extracted ?? [], $changes);
            $l->save();

            $this->journal('radar_listing_corrected', 'Annonce du Radar corrigée', $l, $by, ['fields' => array_keys($changes)]);
        });
    }

    public function review(RadarListing $listing, User $by): RadarListing
    {
        return $this->locked($listing, function (RadarListing $l) use ($by): void {
            abort_code_unless($l->stage->allowsReview(), 409, 'radar.listing.stage_conflict', ['stage' => $l->stage->value]);

            $values = RadarReviewFields::values($l->extracted ?? []);
            // Type, contrat, prix, et un quartier ENCORE approuvé et non fusionné au moment de valider.
            $missing = $this->missingForReview($values);
            abort_code_if($missing !== [], 422, 'radar.review.incomplete', ['fields' => $missing]);

            // ADR-0076 §7 — la décision, une fois. Une annonce lue avant ce ticket n'a pas de suggestion :
            // il n'y a rien à décider, et le journal le dit.
            $suggestion = $this->pendingSuggestion($l);
            if ($suggestion !== null) {
                $suggestion = $this->recorder->edit($suggestion, $values, $by);
            }

            // Ce que l'opérateur avait sous les yeux, figé à la décision : une trace, non un cache.
            $l->fill([
                'stage' => RadarListingStage::Reviewed,
                'stage_reason' => null,
                'matches' => $this->matcher->matchesFor($l),
            ])->save();

            $this->journal('radar_listing_reviewed', 'Annonce du Radar validée', $l, $by, [
                'suggestion_id' => $suggestion?->id,
                'decision' => $suggestion?->decision->value,
                'corrected_fields' => array_keys($suggestion?->correction_diff ?? []),
            ]);
        });
    }

    /**
     * Les champs qui manquent pour valider, dans l'ordre de {@see RadarReviewFields::REQUIRED_FOR_REVIEW}.
     * Le quartier doit être celui d'un référentiel vivant : approuvé, non fusionné depuis la correction.
     *
     * @param  array<string, mixed>  $values
     * @return list<string>
     */
    private function missingForReview(array $values): array
    {
        $missing = [];
        foreach (RadarReviewFields::REQUIRED_FOR_REVIEW as $field) {
            $value = $values[$field] ?? null;
            if ($value === null || $value === '') {
                $missing[] = $field;
            }
        }

        if (! in_array('neighborhood_id', $missing, true) && ! $this->neighborhoodIsLive((int) $values['neighborhood_id'])) {
            $missing[] = 'neighborhood_id';
        }

        return $missing;
    }

    private function neighborhoodIsLive(int $id): bool
    {
        return GeoNeighborhood::query()
            ->whereKey($id)
            ->where('status', ReferentialStatus::Approved->value)
            ->whereNull('merged_into_id')
            ->exists();
    }

    private function pendingSuggestion(RadarListing $listing): ?AiSuggestion
    {
        return AiSuggestion::query()
            ->where('usage_key', RadarExtractionUsage::KEY)
            ->where('subject_type', $listing->getMorphClass())
            ->where('subject_id', $listing->getKey())
            ->where('decision', AiSuggestionDecision::Pending->value)
            ->latest('id')
            ->first();
    }

    /** @param  array<string, mixed>  $properties */
    private function journal(string $event, string $message, RadarListing $listing, User $by, array $properties): void
    {
        activity('Admin')
            ->causedBy($by)
            ->performedOn($listing)
            ->withProperties($properties)
            ->event($event)
            ->log($message);
    }

    /** Transaction courte : l'annonce relue sous verrou, le geste appliqué, la fiche rechargée. */
    private function locked(RadarListing $listing, callable $apply): RadarListing
    {
        return DB::transaction(function () use ($listing, $apply): RadarListing {
            $locked = RadarListing::query()->whereKey($listing->getKey())->lockForUpdate()->firstOrFail();
            $apply($locked);

            return $locked->refresh();
        });
    }
}
