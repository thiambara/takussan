<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\StartRadarCrawlRunRequest;
use App\Http\Requests\Api\Admin\UpdateRadarCrawlSourceRequest;
use App\Http\Resources\Api\Admin\RadarCrawlRunResource;
use App\Http\Resources\Api\Admin\RadarCrawlSourceResource;
use App\Models\RadarCrawlRun;
use App\Models\RadarCrawlSource;
use App\Models\User;
use App\Services\Radar\Crawl\RadarCrawlScheduler;
use App\Services\Radar\Crawl\RadarCrawlSources;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2392 (ADR-0077 §10) — l'onglet Collecte : les sites collectés et leurs passages (lecture, `platform.radar.operate`),
 * les régler et lancer un passage (`platform.radar.publish`, `super_admin` seul — `routes/api/admin-radar.php`).
 *
 * **Allumer une source en fait l'opérateur de celui qui l'allume** : l'extraction des annonces trouvées est jugée en son
 * nom (`AiAuthority` refuse un acteur absent). Éteindre ne défait rien : les annonces trouvées restent, aucun passage ne
 * repart. Un passage manuel part même d'une source éteinte, au nom de celui qui le lance : c'est un geste humain explicite.
 */
class RadarCrawlController extends Controller
{
    public function sources(Request $request, RadarCrawlSources $sources): JsonResponse
    {
        // Les lignes des sites configurés naissent éteintes à la première lecture.
        $sites = $sources->all()->map(fn (RadarCrawlSource $source) => $source->site->value)->all();
        $rows = RadarCrawlSource::buildQuery(RadarCrawlSource::query()->whereIn('site', $sites), $request)
            ->defaultSort('id')
            ->get();

        return $this->json(['data' => RadarCrawlSourceResource::collection($rows)->toArray($request)]);
    }

    public function runs(Request $request): JsonResponse
    {
        $paginator = RadarCrawlRun::buildQuery(null, $request)
            ->defaultSort('-created_at')
            ->paginate()
            ->withQueryString();

        return $this->paginated($paginator, RadarCrawlRunResource::collection($paginator)->toArray($request));
    }

    public function update(UpdateRadarCrawlSourceRequest $request, string $site, RadarCrawlSources $sources): JsonResponse
    {
        $source = $this->sourceOf($site, $sources);
        $changes = $request->changes();
        /** @var User $user */
        $user = $request->user();

        if (($changes['enabled'] ?? false) && ! $source->enabled) {
            $changes += ['operator_id' => $user->id, 'enabled_at' => now()];
        }
        $source->fill($changes)->save();

        activity('Admin')
            ->causedBy($user)
            ->performedOn($source)
            ->withProperties(['changes' => $request->changes()])
            ->event('radar_crawl_source_updated')
            ->log('Collecte du Radar réglée');

        return $this->json(['data' => new RadarCrawlSourceResource($source->fresh()->load('operator'))]);
    }

    /** 202 : le passage part en file longue ; 409 `radar.crawl.active` si un passage est déjà actif sur ce site. */
    public function run(StartRadarCrawlRunRequest $request, string $site, RadarCrawlSources $sources, RadarCrawlScheduler $scheduler): JsonResponse
    {
        $source = $this->sourceOf($site, $sources);
        /** @var User $user */
        $user = $request->user();

        $run = $scheduler->startManually($source->site, $user);
        abort_code_if($run === null, 409, 'radar.crawl.active');

        return $this->json(['data' => new RadarCrawlRunResource($run->fresh())], 202);
    }

    private function sourceOf(string $site, RadarCrawlSources $sources): RadarCrawlSource
    {
        $source = $sources->find($site);
        abort_code_if($source === null, 404, 'radar.crawl.unknown_site');

        return $source;
    }
}
