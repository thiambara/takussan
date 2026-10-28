<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Controllers\Api\Admin\RadarAdvertiserController;
use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\RadarListingStage;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Services\Radar\RadarConsentCoverage;
use App\Services\Radar\RadarFollowUps;
use App\Services\Radar\RadarReviewFields;
use Illuminate\Http\Request;

/**
 * TCK-2388 (ADR-0077 §3, §4, §11) — un annonceur du Radar pour la console : une LIGNE de file (liste) ou la FICHE
 * ({@see self::asCard()}), poste de travail du démarchage. Chaque colonne passe par `whenHas` : sous un sparse
 * fieldset, une colonne non lue est omise plutôt qu'inventée nulle. La prise en charge (`claim`) est un objet
 * CALCULÉ — les colonnes de la prise ne sont pas dans `$queryFields` — et n'est rendue que si elles ont été lues
 * (la liste les ajoute à un sparse fieldset, {@see RadarAdvertiserController::index()}) ;
 * une prise expirée n'est à personne : `null`.
 *
 * Les captures d'une réponse portent une URL signée (voir {@see RadarConsentResource}).
 */
class RadarAdvertiserResource extends BaseResource
{
    private bool $card = false;

    /** La fiche : annonces, messages et réponses chargés par le contrôleur. */
    public function asCard(): static
    {
        $this->card = true;

        return $this;
    }

    /**
     * La prise en charge telle que le front la lit : `{by: {id, name}, until, mine}`, ou `null` si personne ne la tient.
     *
     * @return array{by: array{id: int, name: string}, until: string|null, mine: bool}|null
     */
    public static function claimOf(RadarAdvertiser $advertiser, ?int $viewerId): ?array
    {
        if ($advertiser->claimed_by_id === null || $advertiser->claim_expires_at?->isFuture() !== true) {
            return null;
        }

        return [
            'by' => ['id' => $advertiser->claimed_by_id, 'name' => $advertiser->claimer?->nameWithoutContact() ?? '—'],
            'until' => static::instantOnWire($advertiser->claim_expires_at),
            'mine' => $advertiser->claimed_by_id === $viewerId,
        ];
    }

    public function toArray(Request $request): array
    {
        $row = [
            'id' => $this->whenHas('id'),
            'phone' => $this->whenHas('phone'),
            'display_name' => $this->whenHas('display_name'),
            'nature' => $this->whenHas('nature', fn () => $this->enumValue($this->nature)),
            'do_not_contact_at' => $this->whenHas('do_not_contact_at', fn () => $this->iso($this->do_not_contact_at)),
            'claim' => $this->when(
                array_key_exists('claim_expires_at', $this->resource->getAttributes()),
                fn () => static::claimOf($this->resource, $request->user()?->id),
            ),
        ];

        return $this->card ? $row + $this->cardPart($request) : $row + $this->rowPart();
    }

    /** @return array<string, mixed> */
    private function rowPart(): array
    {
        $counts = [];
        foreach (['reviewed', 'contacted', 'consented'] as $stage) {
            if (array_key_exists("{$stage}_count", $this->resource->getAttributes())) {
                $counts[$stage] = (int) $this->resource->getAttribute("{$stage}_count");
            }
        }

        return [
            'counts' => $this->when($counts !== [], $counts),
            'follow_up' => $this->whenLoaded('outreaches', function () {
                $followUps = app(RadarFollowUps::class);
                // La relation est contrainte aux messages ouverts : le plus récemment envoyé.
                $open = $this->outreaches->sortByDesc(fn ($o) => [$o->sent_at, $o->id])->first();

                return $open === null ? null : [
                    'outreach_id' => $open->id,
                    'sent_at' => $this->iso($open->sent_at),
                    'due_at' => $this->iso($followUps->dueAt($open)),
                    'rank' => $open->follow_up_rank,
                    'propose_no_answer' => $followUps->proposesNoAnswer($open),
                ];
            }),
        ];
    }

    /** @return array<string, mixed> */
    private function cardPart(Request $request): array
    {
        $listings = $this->listings->where('stage', '!=', RadarListingStage::Purged)->sortBy('id')->values();
        $covered = app(RadarConsentCoverage::class)->coveredAmong($listings->pluck('id')->map(fn ($id) => (int) $id)->all());
        $neighborhoods = GeoNeighborhood::query()
            ->whereIn('id', $listings->map(fn ($l) => $l->extracted['neighborhood']['neighborhood_id'] ?? null)->filter()->all())
            ->pluck('name', 'id');

        $followUps = app(RadarFollowUps::class);
        $open = $followUps->open()->where('radar_outreaches.radar_advertiser_id', $this->id)->pluck('radar_outreaches.id')->all();

        return [
            'nature_signals' => $this->whenHas('nature_signals', fn () => $this->nature_signals ?? []),
            'listings' => $listings->map(function ($listing) use ($covered, $neighborhoods): array {
                $values = RadarReviewFields::values($listing->extracted ?? []);
                $linked = $values['neighborhood_id'] === null ? null : ($neighborhoods[$values['neighborhood_id']] ?? null);

                return [
                    'id' => $listing->id,
                    'stage' => $this->enumValue($listing->stage),
                    'source_site' => $this->enumValue($listing->source_site),
                    'title' => $values['title'],
                    'price' => $values['price'],
                    'property_type' => $values['property_type'],
                    'contract' => $values['contract'],
                    'neighborhood' => $linked ?? $values['neighborhood'],
                    'bedrooms' => $values['bedrooms'],
                    'covered_by_consent' => in_array($listing->id, $covered, true),
                    'created_at' => $this->iso($listing->created_at),
                ];
            })->all(),
            'outreaches' => $this->outreaches
                ->sortByDesc(fn ($o) => [$o->created_at, $o->id])
                ->values()
                // L'annonceur est déjà là : le lien `wa.me` lit son numéro sans requête de plus.
                ->each(fn ($outreach) => $outreach->setRelation('advertiser', $this->resource))
                ->map(fn ($outreach) => (new RadarOutreachResource($outreach))
                    ->withFollowUp(in_array($outreach->id, $open, true) ? [
                        'due_at' => $this->iso($followUps->dueAt($outreach)),
                        'propose_no_answer' => $followUps->proposesNoAnswer($outreach),
                    ] : null)
                    ->resolve($request))
                ->all(),
        ];
    }
}
