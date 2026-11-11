<?php

namespace App\Services\Property;

use App\Http\Controllers\Api\PropertyController;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * TCK-2637 — la portée de `GET /api/properties` ({@see PropertyController::index()}), extraite
 * telle quelle pour que `GET /api/properties/portfolio-summary` compte EXACTEMENT les biens que
 * la liste rend (AC3) : les biens que l'appelant peut voir, archivés exclus sauf
 * `include_archived=1` ou un `filter[status]`. Les filtres de la requête s'y ajoutent ensuite
 * par `Property::buildQuery()`, dans les deux.
 */
final class PropertyListScope
{
    /** @return Builder<Property> */
    public static function of(Request $request): Builder
    {
        $user = $request->user();
        $base = Property::query();

        if (! $user->isSuperAdmin()) {
            // TCK-1705 (P153.01) — ses biens sans agence, et ceux des agences où il est membre :
            // l'agent retiré ne liste plus les biens d'agence qu'il avait saisis.
            // TCK-2031 (P190.07, ADR-0031 § 3) — l'agent suspendu non plus : la clause suit
            // `PropertyPolicy::view`, c'est-à-dire un profil propriétaire de tout statut
            // (`BailleurDuBien`), ou un profil au statut actif dans l'agence du bien.
            $memberAgencyIds = $user->ownerProfiles()->pluck('agency_id')
                ->merge($user->activeAgencyIds())
                ->map(fn ($id) => (int) $id)->unique()->values()->all();
            $base->where(function ($q) use ($user, $memberAgencyIds) {
                $q->where(fn ($own) => $own->where('user_id', $user->id)
                    ->where(fn ($a) => $a->whereNull('agency_id')->orWhereIn('agency_id', $memberAgencyIds)));
                // TCK-587 — « Mes biens » d'un bailleur sont les siens (`user_id`) ; le parc de
                // l'agence est celui de son PERSONNEL (ADR-0031).
                if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                    $q->orWhere('agency_id', $staffAgencyId);
                }
            });
        }

        $statusFilter = $request->query('filter.status')
            ?? data_get($request->query('filter', []), 'status');
        $includeArchived = filter_var(
            $request->query('include_archived', false),
            FILTER_VALIDATE_BOOL,
        );
        if (! $includeArchived && ! $statusFilter) {
            $base->where('status', '!=', PropertyStatus::Archived);
        }

        return $base;
    }
}
