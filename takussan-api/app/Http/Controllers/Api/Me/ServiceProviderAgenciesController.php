<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\CollaborationStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-262 — `GET /api/me/service-provider/agencies`.
 *
 * Liste les agences avec lesquelles le SP authentifié collabore (cross-
 * agences, pas filtré sur l'agence active). Supporte les conventions
 * spatie standard du projet : sparse fieldsets, includes, sort, filtres.
 *
 * Source de vérité : ServiceProviderAgencyCollaboration (1 ligne par
 * couple sp_profile_id × agency_id, statut active|paused|ended).
 *
 * Le payload renvoie chaque collaboration enrichie de l'agence — c'est
 * ce que consomme le menu "switch agence" côté frontend (TCK-262 AC2)
 * en complément du `ProfileSwitcher` (qui ne montre qu'une ligne SP
 * agrégée parce que ServiceProviderProfile n'a pas de FK agency).
 */
class ServiceProviderAgenciesController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $sp = ServiceProviderProfile::query()
            ->where('user_id', $user->id)
            ->first();

        if ($sp === null) {
            return $this->json([
                'data' => [],
                'meta' => [
                    'total' => 0,
                    'service_provider_profile_id' => null,
                ],
            ]);
        }

        $base = $this->scopeForProfile($sp);

        $paginator = ServiceProviderAgencyCollaboration::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->items(),
            'meta' => [
                'total' => $paginator->total(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'service_provider_profile_id' => $sp->id,
                'active_count' => ServiceProviderAgencyCollaboration::query()
                    ->where('service_provider_profile_id', $sp->id)
                    ->where('status', CollaborationStatus::Active->value)
                    ->count(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
        ]);
    }

    protected function scopeForProfile(ServiceProviderProfile $profile): Builder
    {
        return ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $profile->id);
    }

    /**
     * Convenience: many UI surfaces just want a flat list of attached
     * Agency rows (with the per-agency status), so we expose a thin
     * sibling endpoint that already projects the agencies.
     */
    public function agencies(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        $sp = ServiceProviderProfile::query()
            ->where('user_id', $user->id)
            ->first();

        if ($sp === null) {
            return $this->json([
                'data' => [],
                'meta' => ['total' => 0, 'service_provider_profile_id' => null],
            ]);
        }

        $collabs = ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $sp->id)
            ->with(['agency:id,name,slug,kind,status'])
            ->get();

        $agencies = $collabs
            ->filter(fn (ServiceProviderAgencyCollaboration $c) => $c->agency !== null)
            ->map(fn (ServiceProviderAgencyCollaboration $c) => [
                'collaboration_id' => $c->id,
                'agency_id' => $c->agency_id,
                'agency' => [
                    'id' => $c->agency->id,
                    'name' => $c->agency->name,
                    'slug' => $c->agency->slug,
                    'kind' => $c->agency->kind?->value,
                    'status' => $c->agency->status?->value,
                ],
                'status' => $c->status?->value,
                'started_at' => $c->started_at?->toDateString(),
                'ended_at' => $c->ended_at?->toDateString(),
            ])
            ->values();

        return $this->json([
            'data' => $agencies,
            'meta' => [
                'total' => $agencies->count(),
                'service_provider_profile_id' => $sp->id,
            ],
        ]);
    }
}
