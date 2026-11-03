<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\DiscardRadarListingRequest;
use App\Http\Requests\Api\Admin\MarkRadarListingDuplicateRequest;
use App\Http\Requests\Api\Admin\ReviewRadarListingRequest;
use App\Http\Requests\Api\Admin\SetRadarListingAdvertiserRequest;
use App\Http\Requests\Api\Admin\UnmergeRadarListingRequest;
use App\Http\Requests\Api\Admin\UpdateRadarListingRequest;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Models\RadarListing;
use App\Services\Radar\RadarAutoMerge;
use App\Services\Radar\RadarListingReview;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2387 (ADR-0077 §5) — la relecture d'une fiche : corriger un champ, valider, la marquer en doublon, l'écarter,
 * lui rattacher un numéro écarté. Chaque geste rend la fiche. Gardés par `super-admin` + `platform-can:platform.radar.operate`
 * (`routes/api/admin-radar.php`).
 */
class RadarListingReviewController extends Controller
{
    public function update(UpdateRadarListingRequest $request, RadarListing $listing, RadarListingReview $review): JsonResponse
    {
        return $this->card($review->correct($listing, $request->changes(), $request->user()));
    }

    public function review(ReviewRadarListingRequest $request, RadarListing $listing, RadarListingReview $review): JsonResponse
    {
        return $this->card($review->review($listing, $request->user()));
    }

    public function duplicate(MarkRadarListingDuplicateRequest $request, RadarListing $listing, RadarListingReview $review): JsonResponse
    {
        return $this->card($review->markDuplicate($listing, $request->ofListingId(), $request->ofPropertyId(), $request->user()));
    }

    public function discard(DiscardRadarListingRequest $request, RadarListing $listing, RadarListingReview $review): JsonResponse
    {
        return $this->card($review->discard($listing, $request->reason(), $request->user()));
    }

    /** 200 aussi quand le numéro a dit STOP : la fiche passe `do_not_contact`, c'est l'issue et non une erreur. */
    public function advertiser(SetRadarListingAdvertiserRequest $request, RadarListing $listing, RadarListingReview $review): JsonResponse
    {
        return $this->card($review->setAdvertiser($listing, $request->e164(), $request->user()));
    }

    /** TCK-2392 (AC7) — séparer une fusion AUTOMATIQUE ; 409 `radar.merge.not_automatic` pour un doublon posé à la main. */
    public function unmerge(UnmergeRadarListingRequest $request, RadarListing $listing, RadarAutoMerge $merge): JsonResponse
    {
        return $this->card($merge->unmerge($listing, $request->user()));
    }

    /** La fiche, avec le quartier rattaché et les provenances lus une fois (la liste n'en a pas besoin). */
    private function card(RadarListing $listing): JsonResponse
    {
        return $this->json(['data' => (new RadarListingResource($listing->load(['advertiser', 'media'])))->withNeighborhoodLink()->withProvenances()]);
    }
}
