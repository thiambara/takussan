<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\PublishRadarListingsRequest;
use App\Http\Requests\Api\Admin\RadarPublicationReadRequest;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Services\Radar\RadarPublisher;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2389 (ADR-0077 §6) — « Publier pour lui » : l'aperçu, la publication, puis le message qui annonce les biens en ligne.
 * Gardés par `super-admin` + `platform-can:platform.radar.publish` (`routes/api/admin-radar.php`) : le `support` prépare, seul
 * le `super_admin` publie. La publication exige la prise en charge de l'annonceur et passe par `idempotent`.
 */
class RadarPublicationController extends Controller
{
    public function preview(RadarPublicationReadRequest $request, RadarAdvertiser $advertiser, RadarPublisher $publisher): JsonResponse
    {
        return $this->json(['data' => $publisher->preview($advertiser)]);
    }

    public function publish(PublishRadarListingsRequest $request, RadarAdvertiser $advertiser, RadarPublisher $publisher): JsonResponse
    {
        $result = $publisher->publish($advertiser, $request->listingIds(), $request->user());

        return $this->json(['data' => [
            'user' => [
                'id' => $result['user']->id,
                'first_name' => $result['user']->first_name,
                'last_name' => $result['user']->last_name,
                'phone' => $result['user']->phone,
            ],
            'agency' => ['id' => $result['agency']->id, 'name' => $result['agency']->name, 'slug' => $result['agency']->slug],
            'created_account' => $result['created'],
            'properties' => array_map(fn (Property $property): array => [
                'id' => $property->id,
                'slug' => $property->slug,
                'title' => $property->title,
                'radar_listing_id' => $property->metadata['radar_listing_id'] ?? null,
                'public_url' => RadarPublisher::publicUrl($property->slug),
            ], $result['properties']),
        ]], 201);
    }

    public function publishedMessage(RadarPublicationReadRequest $request, RadarAdvertiser $advertiser, RadarPublisher $publisher): JsonResponse
    {
        return $this->json(['data' => $publisher->publishedMessage($advertiser, $request->locale())]);
    }
}
