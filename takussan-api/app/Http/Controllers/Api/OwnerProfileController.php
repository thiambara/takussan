<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\OwnerProfileResource;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Policies\OwnerProfilePolicy;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\AgencyKindGuard;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-256 — read-only listing of OwnerProfile rows scoped to the
 * actor's active agency.
 *
 * Spatie/laravel-query-builder takes care of:
 *  - sparse fieldsets (`fields[owner_profiles]=...`)
 *  - filters (`filter[status]=draft|active|...`, `filter[search]=...`)
 *  - includes (`include=user`)
 *  - sort (`sort=-created_at`)
 *
 * TCK-601 (ADR-0044 §1) — la liste passe par {@see OwnerProfileResource} : elle
 * n'expose plus que les colonnes demandées par `fields[]` et des formes MASQUÉES
 * du RIB, du NINEA et du numéro de pièce. La valeur complète sort par
 * {@see self::sensitive()} seulement. Visibility is gated by
 * {@see OwnerProfilePolicy::viewAny()}, puis par
 * {@see AgencyKindGuard::ensureStandardForNonGlobal()} — TCK-284.
 */
class OwnerProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user === null, 401);

        if (! $user->can('viewAny', OwnerProfile::class)) {
            throw new AuthorizationException;
        }

        // TCK-284 — le carnet de propriétaires est réservé aux agences
        // `standard` (TCK-256, confirmé : dans une agence `individual`, le
        // propriétaire est le créateur du compte lui-même). La règle n'était
        // tenue que sur l'invitation et sur l'écran Next ; la LECTURE restait
        // ouverte à un appel direct.
        //
        // Placée APRÈS `viewAny` à dessein : seul un acteur qui aurait été
        // autorisé reçoit « réservé aux agences standard ». Les autres gardent
        // leur refus d'autorisation, qui dit vrai. Le périmètre reste donc
        // exactement celui de `viewAny` — agency_admin et agent de l'agence —
        // et n'atteint aucun autre rôle.
        AgencyKindGuard::ensureStandardForNonGlobal($user, $user->agency_id);

        $base = $this->visibleScope($user, $request);
        $query = OwnerProfile::buildQuery($base, $request)->defaultSort('-created_at');

        // TCK-601 — les colonnes sensibles ne sont plus demandables par `fields[]` ; elles sont
        // chargées ici pour que la Resource en calcule le MASQUE. Sans `fields[]`, `select *` les
        // charge déjà.
        if ($query->getQuery()->columns !== null) {
            $query->addSelect(array_map(
                static fn (string $column): string => 'owner_profiles.'.$column,
                OwnerProfile::SENSITIVE,
            ));
        }

        $paginator = $query->paginate((int) $request->input('per_page', 20));

        return $this->paginated($paginator, OwnerProfileResource::collection($paginator)->resolve($request));
    }

    /**
     * TCK-601 (ADR-0044 §1, §4) — le RIB, le NINEA et le numéro de pièce EN CLAIR, pour l'admin de
     * l'agence du profil (et le super-admin, par `Gate::before`). Chaque consultation est
     * journalisée ; l'agent n'y a pas accès.
     */
    public function sensitive(Request $request, OwnerProfile $ownerProfile, PersonalDataAccessLogger $accessLog): JsonResponse
    {
        $this->authorize('viewSensitive', $ownerProfile);

        $accessLog->record($request->user(), $ownerProfile, PersonalDataAccessLogger::SURFACE_OWNER_SENSITIVE);

        return $this->json([
            'data' => [
                'id' => $ownerProfile->id,
                'rib' => $ownerProfile->rib,
                'tax_id' => $ownerProfile->tax_id,
                'id_document_type' => $ownerProfile->id_document_type?->value,
                'id_document_number' => $ownerProfile->id_document_number,
            ],
        ]);
    }

    /**
     * super_admin sees everything; agency-side roles see their agency
     * only; everyone else sees nothing (defensive — `viewAny` already
     * filters out non-agency roles).
     */
    protected function visibleScope(User $user, Request $request): Builder
    {
        if ($user->isSuperAdmin()) {
            return OwnerProfile::query();
        }

        $agencyId = $user->agency_id;

        return OwnerProfile::query()->where('agency_id', $agencyId);
    }
}
