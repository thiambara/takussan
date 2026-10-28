<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Jobs\Radar\FingerprintRadarSourcePhotos;
use App\Models\RadarListing;
use App\Services\Radar\RadarMatcher;
use App\Services\Radar\RadarMatchPresenter;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2387 (ADR-0077 §6) — les rapprochements d'une fiche, calculés à l'ouverture : un bien publié après la
 * relecture, une annonce saisie depuis, se voient sans rien invalider. Gardé par `super-admin` +
 * `platform-can:platform.radar.operate`.
 */
class RadarListingMatchController extends Controller
{
    /**
     * `{data: {photos: {status, total, done}, matches: [...]}}`. Les empreintes des photos source se
     * calculent à part : tant qu'elles ne sont pas toutes là, `photos.status` vaut `pending` et le signal
     * photo peut manquer — la fiche rappelle la route.
     */
    public function __invoke(RadarListing $listing, RadarMatcher $matcher, RadarMatchPresenter $presenter): JsonResponse
    {
        $photos = $listing->photoFingerprintStatus();

        // Jamais calculées : on met le calcul en file (unique, il ne part qu'une fois par annonce).
        if ($listing->source_photo_hashes === null && $photos['status'] !== 'none') {
            FingerprintRadarSourcePhotos::dispatch($listing->id);
        }

        return $this->json(['data' => [
            'photos' => $photos,
            'matches' => $presenter->present($matcher->matchesFor($listing)),
        ]]);
    }
}
