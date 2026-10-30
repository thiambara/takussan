<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RadarListingPhotoActionRequest;
use App\Http\Requests\Api\Admin\StoreRadarListingPhotosRequest;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Models\RadarListing;
use App\Services\Radar\RadarPhotoReserve;
use Illuminate\Http\JsonResponse;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * TCK-2389 (décision 3a) — la réserve de photos d'une annonce `consented` : relancer la lecture, déposer, retirer. Gardés par
 * `super-admin` + `platform-can:platform.radar.operate` (`routes/api/admin-radar.php`) ; chaque geste exige la prise en charge
 * de l'annonceur ({@see RadarPhotoReserve}).
 */
class RadarListingPhotoController extends Controller
{
    /** 202 : la lecture est remise en file, la fiche rend l'état de la préparation. */
    public function fetch(RadarListingPhotoActionRequest $request, RadarListing $listing, RadarPhotoReserve $reserve): JsonResponse
    {
        return $this->card($reserve->refetch($listing, $request->user()), 202);
    }

    public function store(StoreRadarListingPhotosRequest $request, RadarListing $listing, RadarPhotoReserve $reserve): JsonResponse
    {
        return $this->card($reserve->deposit($listing, $request->photos(), $request->user()), 201);
    }

    public function destroy(RadarListingPhotoActionRequest $request, RadarListing $listing, Media $media, RadarPhotoReserve $reserve): JsonResponse
    {
        $reserve->remove($listing, $media, $request->user());

        return $this->json(null, 204);
    }

    private function card(RadarListing $listing, int $status): JsonResponse
    {
        return $this->json(['data' => (new RadarListingResource($listing->load(['advertiser', 'media'])))->withNeighborhoodLink()->withProvenances()], $status);
    }
}
