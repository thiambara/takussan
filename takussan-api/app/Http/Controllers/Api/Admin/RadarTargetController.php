<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StoreRadarTargetRequest;
use App\Http\Requests\Api\Admin\UpdateRadarTargetRequest;
use App\Http\Resources\Api\Admin\RadarListingResource;
use App\Http\Resources\Api\Admin\RadarTargetResource;
use App\Models\Enums\RadarTargetOrigin;
use App\Models\RadarListing;
use App\Models\RadarTarget;
use App\Models\User;
use App\Services\Radar\Targets\RadarTargets;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2468 (ADR-0087 §5) — les cibles du Radar. Lire (`platform.radar.operate`, du `support` au `super_admin`) ; créer,
 * modifier, retirer (`platform.radar.publish`, `super_admin` seul — une cible engage ce que la collecte lit et paie). Le
 * partage est celui des sources (ADR-0080), dans `routes/api/admin-radar.php`.
 *
 * Les écritures passent par {@see RadarTargets} : plafond (`radar.targets.too_many`) et doublon (`radar.targets.duplicate`)
 * y sont jugés sous verrou. Une cible ne se supprime jamais : `DELETE` la retire.
 */
class RadarTargetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $paginator = RadarTarget::buildQuery(null, $request)
            ->defaultSort('-created_at')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarTargetResource::collection($paginator)->toArray($request));
    }

    public function store(StoreRadarTargetRequest $request, RadarTargets $targets): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $target = $targets->create(
            (string) $request->validated('name'),
            (array) $request->criteria(),
            $request->status(),
            RadarTargetOrigin::Operator,
            $user,
        );

        activity('Admin')->causedBy($user)->performedOn($target)->event('radar_target_created')->log('Cible du Radar créée');

        return $this->json(['data' => new RadarTargetResource($target->fresh())], 201);
    }

    public function show(RadarTarget $target): JsonResponse
    {
        return $this->json(['data' => new RadarTargetResource($target)]);
    }

    public function update(UpdateRadarTargetRequest $request, RadarTarget $target, RadarTargets $targets): JsonResponse
    {
        $updated = $targets->update($target, $request->changes());

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($updated)
            ->withProperties(['fields' => array_keys($request->changes())])
            ->event('radar_target_updated')
            ->log('Cible du Radar modifiée');

        return $this->json(['data' => new RadarTargetResource($updated->fresh())]);
    }

    public function destroy(Request $request, RadarTarget $target, RadarTargets $targets): JsonResponse
    {
        $retired = $targets->retire($target);

        activity('Admin')->causedBy($request->user())->performedOn($retired)->event('radar_target_retired')->log('Cible du Radar retirée');

        return $this->json(['data' => new RadarTargetResource($retired->fresh())]);
    }

    /** Les annonces rattachées à la cible, les plus récentes d'abord, sous les filtres et champs de la liste du Radar. */
    public function listings(Request $request, RadarTarget $target): JsonResponse
    {
        $linked = DB::table('radar_listing_target')->select('radar_listing_id')->where('radar_target_id', $target->id);
        $paginator = RadarListing::buildQuery(RadarListing::query()->whereIn('id', $linked), $request)
            ->defaultSort('-created_at')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarListingResource::collection($paginator)->toArray($request));
    }
}
