<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ReviewRadarListingRequest;
use App\Http\Requests\Api\Admin\UpdateRadarListingRequest;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Models\RadarListing;
use App\Services\Radar\RadarListingReview;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2387 (ADR-0077 §5) — la relecture d'une fiche : corriger un champ, puis valider. Les deux gestes
 * rendent la fiche. Gardés par `super-admin` + `platform-can:platform.radar.operate`
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

    /** La fiche, avec le quartier rattaché lu une fois (la liste n'en a pas besoin). */
    private function card(RadarListing $listing): JsonResponse
    {
        return $this->json(['data' => (new RadarListingResource($listing->load(['advertiser', 'media'])))->withNeighborhoodLink()]);
    }
}
