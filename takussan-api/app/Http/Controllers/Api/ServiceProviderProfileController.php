<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Profiles\ServiceProviderProfile;
use App\Policies\Profiles\ServiceProviderProfilePolicy;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-260 — read-only listing of ServiceProviderProfile rows scoped to
 * the active agency via `service_provider_agency_collaborations`.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[service_provider_profiles]=...`)
 *  - filters (`filter[status]=draft|active|...`, `filter[search]=...`)
 *  - includes (`include=user,agencyCollaborations,invitations`)
 *  - sort (`sort=-created_at`)
 *
 * Visibility is gated by {@see ServiceProviderProfilePolicy::viewAny()}.
 */
class ServiceProviderProfileController extends Controller
{
    public function index(Request $request, Agency $agency): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', [ServiceProviderProfile::class, $agency])) {
            throw new AuthorizationException;
        }

        $base = $this->scopeForAgency($agency);
        $paginator = ServiceProviderProfile::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->items(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    /**
     * Le profil SP est rattaché à l'agence via la table pivot
     * `service_provider_agency_collaborations` ; on filtre via un
     * `whereHas` plutôt qu'une jointure pour rester compatible avec
     * spatie/laravel-query-builder (les sparse fieldsets sont plus
     * propres sans aliasing manuel).
     */
    protected function scopeForAgency(Agency $agency): Builder
    {
        return ServiceProviderProfile::query()
            ->whereHas('agencyCollaborations', function (Builder $query) use ($agency): void {
                $query->where('agency_id', $agency->id);
            });
    }
}
