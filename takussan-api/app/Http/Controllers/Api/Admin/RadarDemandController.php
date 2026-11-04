<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\RefreshRadarDemandRequest;
use App\Http\Requests\Api\Admin\RevertRadarTargetRevisionRequest;
use App\Http\Requests\Api\Admin\UpdateRadarDemandRequest;
use App\Http\Resources\Api\Admin\RadarDemandSettingResource;
use App\Http\Resources\Api\Admin\RadarTargetRevisionResource;
use App\Jobs\Radar\RefreshRadarDemandTargets;
use App\Models\RadarDemandSetting;
use App\Models\RadarTargetRevision;
use App\Models\User;
use App\Services\Radar\Targets\RadarDemandCurator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2470 (ADR-0087 §6) — les cibles de la demande : le réglage (allumer, éteindre, rafraîchir maintenant) et l'historique
 * des révisions (lire, défaire). Lire : `platform.radar.operate` ; écrire : `platform.radar.publish` (`super_admin`), même
 * partage que les cibles et les sources (`routes/api/admin-radar.php`).
 */
class RadarDemandController extends Controller
{
    public function show(): JsonResponse
    {
        return $this->json(['data' => new RadarDemandSettingResource(RadarDemandSetting::current()->load('operator'))]);
    }

    /**
     * Allumer : l'appelant devient l'opérateur — aussi quand le réglage est allumé mais que son opérateur a disparu (c'est
     * ainsi qu'on le reprend). Éteindre : l'opérateur reste affiché, rien ne part.
     */
    public function update(UpdateRadarDemandRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $enabled = $request->boolean('enabled');

        $setting = DB::transaction(function () use ($user, $enabled): RadarDemandSetting {
            RadarDemandSetting::current();
            $setting = RadarDemandSetting::query()->whereKey(RadarDemandSetting::ID)->lockForUpdate()->firstOrFail();
            $takesOver = $enabled && (! $setting->enabled || $setting->blockedReason() === RadarDemandSetting::BLOCKED_OPERATOR_MISSING);
            $setting->enabled = $enabled;
            if ($takesOver) {
                $setting->operator_id = $user->id;
                $setting->enabled_at = now();
            }
            $setting->save();

            return $setting;
        });

        activity('Admin')
            ->causedBy($user)
            ->performedOn($setting)
            ->withProperties(['enabled' => $enabled])
            ->event('radar_demand_updated')
            ->log('Cibles de la demande réglées');

        return $this->json(['data' => new RadarDemandSettingResource($setting->fresh()->load('operator'))]);
    }

    /** 202 : le passage part en file `ai` ; 409 si le réglage est éteint ou sans opérateur (`blocked_reason`). */
    public function refresh(RefreshRadarDemandRequest $request): JsonResponse
    {
        $setting = RadarDemandSetting::current();
        $blocked = $setting->blockedReason();
        abort_code_if($blocked !== null, 409, (string) $blocked);

        RefreshRadarDemandTargets::dispatch();
        activity('Admin')->causedBy($request->user())->performedOn($setting)->event('radar_demand_refreshed')->log('Passage des cibles de la demande lancé');

        return $this->json(['data' => new RadarDemandSettingResource($setting->fresh()->load('operator'))], 202);
    }

    public function revisions(Request $request): JsonResponse
    {
        $paginator = RadarTargetRevision::buildQuery(null, $request)
            ->defaultSort('-id')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarTargetRevisionResource::collection($paginator)->toArray($request));
    }

    /** 409 `radar.targets.revision_superseded` (une révision postérieure touche les mêmes cibles, ou l'une est épinglée) ou `radar.targets.revision_reverted`. */
    public function revert(RevertRadarTargetRevisionRequest $request, RadarTargetRevision $revision, RadarDemandCurator $curator): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $reverted = $curator->revert($revision, $user);

        activity('Admin')->causedBy($user)->performedOn($reverted)->event('radar_target_revision_reverted')->log('Révision des cibles de la demande défaite');

        return $this->json(['data' => new RadarTargetRevisionResource($reverted->fresh())]);
    }
}
