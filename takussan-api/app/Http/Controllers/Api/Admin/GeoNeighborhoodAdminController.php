<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Admin\GeoMergeRequest;
use App\Http\Requests\Admin\GeoRenameRequest;
use App\Models\Enums\ReferentialStatus;
use App\Models\GeoNeighborhood;
use App\Services\Geo\GeoNeighborhoodModeration;
use App\Services\Geo\GeoNeighborhoodResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * TCK-633 (AC5) — la file des quartiers proposés. Les routes sont sous `admin/` et le middleware
 * `super-admin` (cf. `PlatformRoutesDefaultDenyTest`) : aucun geste plateforme ne les ouvre à un
 * opérateur `viewer` ou `support`.
 */
class GeoNeighborhoodAdminController extends Controller
{
    public function __construct(private readonly GeoNeighborhoodModeration $moderation) {}

    public function index(Request $request): JsonResponse
    {
        $base = GeoNeighborhood::query()
            ->whereNull('merged_into_id')
            ->with(['city.region', 'createdBy'])
            ->withCount('addresses');

        $paginator = GeoNeighborhood::buildQuery($base, $request)->defaultSort('-created_at')->paginate();
        $proches = $this->prochesApprouves($paginator->getCollection());

        return $this->paginated($paginator, $paginator->getCollection()->map(fn (GeoNeighborhood $q) => $this->format($q) + [
            'similar' => $proches[$q->id] ?? [],
        ])->values());
    }

    /**
     * TCK-788 (P17.02) — pour chaque proposition de la page, les quartiers APPROUVÉS de sa ville dont
     * la clé repliée sans accents ni ponctuation coïncide : le double probable, à fusionner. Le
     * résolveur, lui, garde les accents (ADR-0062 § 1) ; c'est ici seulement qu'on les ignore.
     * Une requête pour la page, et non une par ligne.
     *
     * @param  Collection<int, GeoNeighborhood>  $lignes
     * @return array<int, list<array{id: int, name: string}>>
     */
    private function prochesApprouves(Collection $lignes): array
    {
        $propositions = $lignes->filter(fn (GeoNeighborhood $q) => $q->status === ReferentialStatus::Pending);
        if ($propositions->isEmpty()) {
            return [];
        }

        $parVille = GeoNeighborhood::query()
            ->whereIn('geo_city_id', $propositions->pluck('geo_city_id')->unique()->values())
            ->where('status', ReferentialStatus::Approved)
            ->whereNull('merged_into_id')
            ->orderBy('name')
            ->get(['id', 'geo_city_id', 'name'])
            ->groupBy(fn (GeoNeighborhood $q) => $q->geo_city_id.'|'.GeoNeighborhoodResolver::cleSansAccents($q->name));

        $proches = [];
        foreach ($propositions as $q) {
            $proches[$q->id] = ($parVille[$q->geo_city_id.'|'.GeoNeighborhoodResolver::cleSansAccents($q->name)] ?? collect())
                ->map(fn (GeoNeighborhood $a) => ['id' => (int) $a->id, 'name' => $a->name])
                ->values()
                ->all();
        }

        return $proches;
    }

    public function approve(Request $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->approuver($neighborhood, $request->user()))]);
    }

    public function reject(Request $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->rejeter($neighborhood, $request->user()))]);
    }

    public function rename(GeoRenameRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        return $this->json(['data' => $this->format($this->moderation->renommer($neighborhood, (string) $request->validated('name'), $request->user()))]);
    }

    public function merge(GeoMergeRequest $request, GeoNeighborhood $neighborhood): JsonResponse
    {
        $cible = GeoNeighborhood::query()->findOrFail((int) $request->validated('into_id'));

        return $this->json(['data' => $this->format($this->moderation->fusionner($neighborhood, $cible, $request->user()))]);
    }

    /** @return array<string, mixed> */
    private function format(GeoNeighborhood $q): array
    {
        $q->loadMissing(['city.region', 'createdBy']);

        return [
            'id' => $q->id,
            'name' => $q->name,
            'slug' => $q->slug,
            'status' => $q->status->value,
            'origin' => $q->origin->value,
            'city' => ['id' => $q->city->id, 'name' => $q->city->name],
            'region' => ['id' => $q->city->region->id, 'name' => $q->city->region->name],
            'created_by' => $q->createdBy !== null ? ['id' => $q->createdBy->id, 'name' => trim($q->createdBy->first_name.' '.$q->createdBy->last_name)] : null,
            'addresses_count' => (int) ($q->addresses_count ?? $q->addresses()->count()),
            'created_at' => $q->created_at?->toIso8601String(),
        ];
    }
}
