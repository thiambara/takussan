<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
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

        $base = $this->scopeForAgency($agency, $this->collaborationStatuses($request));
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
    /**
     * @param  list<string>  $statuses
     */
    protected function scopeForAgency(Agency $agency, array $statuses): Builder
    {
        // TCK-592 — le statut DU COUPLE (profil, cette agence), défaut `active` : un prestataire dont
        // la collaboration a pris fin ne figure plus dans le carnet, sauf à le demander.
        return ServiceProviderProfile::query()
            ->whereHas('agencyCollaborations', function (Builder $query) use ($agency, $statuses): void {
                $query->where('agency_id', $agency->id)->whereIn('status', $statuses);
            });
    }

    /**
     * `filter[collaboration_status]=active,paused` — liste à virgules, comme les autres filtres spatie.
     * Une valeur inconnue est ignorée ; aucune valeur connue → `active`.
     *
     * @return list<string>
     */
    private function collaborationStatuses(Request $request): array
    {
        $raw = $request->input('filter.collaboration_status');
        $values = is_array($raw) ? $raw : explode(',', (string) $raw);

        $statuses = collect($values)
            ->map(fn ($value) => CollaborationStatus::tryFrom(trim((string) $value))?->value)
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $statuses === [] ? [CollaborationStatus::Active->value] : $statuses;
    }
}
