<?php

namespace App\Services\Radar;

use App\Ai\Usages\RadarExtractionUsage;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\RadarAdvertiserNature;
use App\Models\Enums\RadarDiscardReason;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\SuggestionRecorder;
use App\Support\RadarPhone;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2387 (ADR-0077 §5) — la relecture d'une fiche extraite : corriger un champ, puis valider ; et les gestes qui
 * la ferment ou la rattachent (doublon, écart, annonceur).
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
 *
 * **La nature suit la relecture** (TCK-2388, décision 3 du porteur, 2026-10-28) : à la validation, une nature
 * corrigée (`extracted.advertiser_nature.corrected`) devient `radar_advertisers.nature` ; le journal
 * `radar_listing_reviewed` le dit (`advertiser_nature_propagated`).
 */
final class RadarListingReview
{
    public function __construct(
        private readonly SuggestionRecorder $recorder,
        private readonly RadarMatcher $matcher,
        private readonly RadarAdvertiserDirectory $directory,
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
        $snapshot = $this->snapshotBefore($listing, $listing->stage->allowsReview());

        return $this->locked($listing, function (RadarListing $l) use ($by, $listing, $snapshot): void {
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

            $l->fill([
                'stage' => RadarListingStage::Reviewed,
                'stage_reason' => null,
                'matches' => $this->frozen($snapshot, $listing, $l),
            ])->save();

            // TCK-2388 (décision 3) — la nature corrigée à la relecture devient celle de l'annonceur : la dernière
            // relecture humaine l'emporte, les indices de l'IA restent. Ordre des verrous : l'annonce (déjà
            // tenue), puis l'annonceur.
            $nature = $l->extracted['advertiser_nature'] ?? null;
            $propagated = false;
            if ($l->radar_advertiser_id !== null && is_array($nature) && ($nature['corrected'] ?? false) === true
                && ($value = RadarAdvertiserNature::tryFrom((string) ($nature['value'] ?? ''))) !== null) {
                $advertiser = RadarAdvertiser::query()->whereKey($l->radar_advertiser_id)->lockForUpdate()->firstOrFail();
                $advertiser->nature = $value;
                $advertiser->save();
                $propagated = true;
            }

            $this->journal('radar_listing_reviewed', 'Annonce du Radar validée', $l, $by, [
                'suggestion_id' => $suggestion?->id,
                'decision' => $suggestion?->decision->value,
                'corrected_fields' => array_keys($suggestion?->correction_diff ?? []),
                'advertiser_nature_propagated' => $propagated,
            ]);
        });
    }

    /**
     * TCK-2387 — « doublon de » : la fiche est la même annonce qu'une autre fiche, ou qu'un bien du
     * catalogue. Elle ferme l'annonce (`duplicate`), le lien posé ; la suggestion reste en attente — personne
     * n'a jugé l'extraction, le taux d'acceptation n'est pas touché (décision 13a).
     *
     * Une chaîne ne se forme jamais : la requête refuse une cible déjà doublon, et les doublons qui pointaient
     * vers cette annonce sont repointés vers sa nouvelle cible.
     */
    public function markDuplicate(RadarListing $listing, ?int $ofListingId, ?int $ofPropertyId, User $by): RadarListing
    {
        $snapshot = $this->snapshotBefore($listing, $listing->stage->allowsClosing());

        return $this->locked($listing, function (RadarListing $l) use ($ofListingId, $ofPropertyId, $by, $listing, $snapshot): void {
            abort_code_unless($l->stage->allowsClosing(), 409, 'radar.listing.stage_conflict', ['stage' => $l->stage->value]);

            $l->fill([
                'stage' => RadarListingStage::Duplicate,
                'stage_reason' => null,
                'duplicate_of_listing_id' => $ofListingId,
                'duplicate_of_property_id' => $ofPropertyId,
                'matches' => $this->frozen($snapshot, $listing, $l),
            ])->save();

            // Celles qui pointaient déjà vers CETTE annonce (B → A) suivent sa nouvelle cible (A → C) : sans quoi
            // B → A → C s'enchaîne, et la profondeur n'a plus de borne. Elles sont `duplicate`, donc la cible ne
            // peut pas être l'une d'elles (une cible `duplicate` est refusée à la validation de la requête).
            RadarListing::query()->where('duplicate_of_listing_id', $l->id)->update([
                'duplicate_of_listing_id' => $ofListingId,
                'duplicate_of_property_id' => $ofPropertyId,
            ]);

            $this->journal('radar_listing_marked_duplicate', 'Annonce du Radar marquée en doublon', $l, $by, [
                'of_listing_id' => $ofListingId,
                'of_property_id' => $ofPropertyId,
            ]);
        });
    }

    /**
     * TCK-2387 — écarter une annonce, pour un motif de la liste fermée. Une annonce `captured` dont l'extraction
     * tourne encore s'écarte aussi : le `settle()` du job n'écrit rien d'une annonce qui n'est plus `captured`.
     */
    public function discard(RadarListing $listing, RadarDiscardReason $reason, User $by): RadarListing
    {
        $snapshot = $this->snapshotBefore($listing, $listing->stage->allowsClosing());

        return $this->locked($listing, function (RadarListing $l) use ($reason, $by, $listing, $snapshot): void {
            abort_code_unless($l->stage->allowsClosing(), 409, 'radar.listing.stage_conflict', ['stage' => $l->stage->value]);

            $l->fill([
                'stage' => RadarListingStage::Discarded,
                'stage_reason' => $reason->code(),
                'matches' => $this->frozen($snapshot, $listing, $l),
            ])->save();

            $this->journal('radar_listing_discarded', 'Annonce du Radar écartée', $l, $by, ['reason' => $reason->value]);
        });
    }

    /**
     * TCK-2387 (AC6) — rattacher l'annonce à un numéro qu'elle a lu sans le retenir (écarté d'ordinaire : trois
     * numéros ou plus, ou un numéro de service). Le numéro doit être CONNU de l'annonce : on ne fabrique pas un
     * annonceur à partir d'un numéro venu d'ailleurs.
     *
     * Dans le verrou de l'annonce, puis de l'annonceur (TCK-2386) : un STOP dit pour ce numéro l'emporte, y
     * compris entre la lecture du refus et le verrou de l'annonceur — l'annonce passe alors `do_not_contact`,
     * issue (200) et non erreur, comme dans le job d'extraction. `extracted` n'est pas réécrit.
     * Le journal ne porte jamais le numéro.
     */
    public function setAdvertiser(RadarListing $listing, string $e164, User $by): RadarListing
    {
        return $this->locked($listing, function (RadarListing $l) use ($e164, $by): void {
            abort_code_unless($l->stage->allowsAdvertiserChange(), 409, 'radar.listing.stage_conflict', ['stage' => $l->stage->value]);

            $dropped = $this->canonicalAll((array) ($l->extracted['phones_dropped'] ?? []));
            $known = [
                ...$this->canonicalAll((array) ($l->extracted['phones'] ?? [])),
                ...$dropped,
                ...RadarPhone::fromText((string) $l->raw_text),
            ];
            abort_code_unless(in_array($e164, $known, true), 422, 'radar.advertiser.phone_unknown');

            $stop = $this->directory->refusedAmong([$e164]);
            if ($stop !== null) {
                $advertiser = $stop;
                $refused = true;
            } else {
                // Créé s'il n'existe pas (`insertOrIgnore`), puis relu SOUS SON VERROU : un STOP dit depuis la
                // lecture du refus l'emporte.
                $created = $this->directory->findOrCreate($e164);
                $advertiser = RadarAdvertiser::query()->whereKey($created->id)->lockForUpdate()->firstOrFail();
                $refused = $advertiser->do_not_contact_at !== null;
                // Une purge entre `findOrCreate()` et le verrou ne voyait pas encore cette annonce : elle a pu effacer le numéro rendu.
                $this->directory->restorePhone($advertiser, $e164);
            }

            $l->fill($refused
                ? ['stage' => RadarListingStage::DoNotContact, 'stage_reason' => null, 'radar_advertiser_id' => $advertiser->id]
                : ['radar_advertiser_id' => $advertiser->id])->save();
            if ($refused) {
                // TCK-2391 : un STOP tardif purge l'annonce tout de suite.
                PurgeRadarAdvertiser::dispatch($advertiser->id)->afterCommit();
            }

            $this->journal('radar_listing_advertiser_set', 'Annonceur de l\'annonce du Radar posé', $l, $by, [
                'advertiser_id' => $advertiser->id,
                'from_dropped' => in_array($e164, $dropped, true),
                'do_not_contact' => $refused,
            ]);
        });
    }

    /**
     * Les rapprochements se calculent AVANT le verrou : le matcher fait une douzaine de requêtes, dont des
     * recherches jsonb, et la ligne verrouillée ferait attendre tout autre geste sur la fiche pendant ce temps.
     *
     * @return list<array<string, mixed>>|null null : le geste ne sera pas permis, inutile de calculer
     */
    private function snapshotBefore(RadarListing $listing, bool $allowed): ?array
    {
        return $allowed ? $this->matcher->matchesFor($listing) : null;
    }

    /**
     * Ce que l'opérateur avait sous les yeux, figé à la décision : une trace, non un cache. Si la fiche a changé
     * entre la lecture et le verrou (une correction, un autre annonceur, ou le calcul des empreintes de photo qui
     * vient d'aboutir), le calcul d'avant ne décrit plus ce qui est décidé : on le refait, sous verrou, pour ce
     * cas rare.
     *
     * @param  list<array<string, mixed>>|null  $snapshot
     * @return list<array<string, mixed>>
     */
    private function frozen(?array $snapshot, RadarListing $before, RadarListing $locked): array
    {
        if (
            $snapshot === null
            || $locked->extracted != $before->extracted
            || $locked->radar_advertiser_id !== $before->radar_advertiser_id
            || $locked->source_photo_hashes != $before->source_photo_hashes
        ) {
            return $this->matcher->matchesFor($locked);
        }

        return $snapshot;
    }

    /**
     * @param  list<mixed>  $phones
     * @return list<string>
     */
    private function canonicalAll(array $phones): array
    {
        $out = [];
        foreach ($phones as $phone) {
            $e164 = is_string($phone) ? RadarPhone::canonical($phone) : null;
            if ($e164 !== null) {
                $out[] = $e164;
            }
        }

        return $out;
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
