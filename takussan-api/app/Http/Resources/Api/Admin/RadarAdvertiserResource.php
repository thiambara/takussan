<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Enums\RadarListingStage;
use App\Models\GeoNeighborhood;
use App\Models\RadarAdvertiser;
use App\Services\Radar\AdvertiserAccountRelease;
use App\Services\Radar\RadarConsentCoverage;
use App\Services\Radar\RadarFollowUps;
use App\Services\Radar\RadarReviewFields;
use App\Services\Radar\Whatsapp\RadarWhatsappNumber;
use Illuminate\Http\Request;

/**
 * TCK-2388 (ADR-0077 §3, §4, §11) — un annonceur du Radar pour la console : une LIGNE de file (liste) ou la FICHE
 * ({@see self::asCard()}), poste de travail du démarchage. Chaque colonne passe par `whenHas` : sous un sparse
 * fieldset, une colonne non lue est omise plutôt qu'inventée nulle. La prise en charge (`claim`) est un objet
 * CALCULÉ — les colonnes de la prise ne sont pas dans `$queryFields` — et n'est rendue que si elles ont été lues
 * (la liste les ajoute à un sparse fieldset : `App\Http\Controllers\Api\Admin\RadarAdvertiserController::index()`) ;
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
            // TCK-2413 — l'échéance de purge de la première annonce que la publication a laissée (`null` : aucune).
            'left_purge_at' => $this->when(
                array_key_exists('left_purge_at', $this->resource->getAttributes()),
                fn () => $this->iso($this->resource->left_purge_at),
            ),
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
            // TCK-2395 — l'envoi par l'API du numéro du Radar est-il possible ici (le bouton de TCK-2426) : la configuration
            // seule ; la garde du numéro des notifications se juge à l'envoi.
            'whatsapp_api_available' => app(RadarWhatsappNumber::class)->available(),
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
                    // TCK-2413 — un code : pourquoi la publication de la réclamation a laissé l'annonce à l'opérateur.
                    'stage_reason' => $listing->stage_reason,
                    // L'échéance de purge d'une annonce jamais publiée (ADR-0077 §9) : la console la montre sur l'annonce laissée.
                    'purge_at' => $this->iso($listing->purge_at),
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
            'account' => $this->accountPart(),
        ];
    }

    /**
     * TCK-2413 — le compte rattaché à l'annonceur : supprimé, il bloque la réclamation tant que le super-admin ne l'a pas
     * délié (`releasable`, {@see AdvertiserAccountRelease}). `claimed` : l'annonceur a réclamé avec ce compte ; sinon le Radar
     * l'a créé pour lui. `null` : aucun compte rattaché.
     *
     * @return array{user_id: int, deleted: bool, releasable: bool, claimed: bool}|null
     */
    private function accountPart(): ?array
    {
        if ($this->resource->user_id === null) {
            return null;
        }

        return [
            'user_id' => (int) $this->resource->user_id,
            'deleted' => AdvertiserAccountRelease::deletedAccount($this->resource),
            'releasable' => AdvertiserAccountRelease::releasable($this->resource),
            'claimed' => AdvertiserAccountRelease::claimedWith($this->resource),
        ];
    }
}
