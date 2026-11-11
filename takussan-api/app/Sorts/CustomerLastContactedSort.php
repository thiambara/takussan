<?php

namespace App\Sorts;

use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * Contre-vérification adverse de TCK-2583/TCK-2588 — `sort=last_contacted_at`, jugé FICHE PAR FICHE
 * comme la ressource qui sert la valeur (`CustomerResource::readsVisits`) : le dernier contact ne
 * classe une fiche que pour le personnel de SON agence (et le super-admin). Ailleurs il vaut `NULL` —
 * ce que la page sert —, sans quoi un compte personnel d'une agence et bailleur auteur dans une autre
 * verrait l'ordre basculer à l'heure d'un compte rendu déposé sur le bien d'un autre bailleur.
 * Même place des `NULL` que le tri d'une colonne nue sous PostgreSQL : en dernier en ASC, en tête en DESC.
 */
class CustomerLastContactedSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $direction = $descending ? 'DESC' : 'ASC';
        $viewer = request()->user();

        if ($viewer?->isSuperAdmin() === true) {
            $query->orderBy('customers.last_contacted_at', $direction);

            return;
        }

        $agencyIds = $viewer === null ? [] : app(MembershipCapabilityResolver::class)->staffAgencyIds($viewer);
        if ($agencyIds === []) {
            $query->orderByRaw("(NULL::timestamp) {$direction}");

            return;
        }

        $query->orderByRaw(
            'CASE WHEN customers.agency_id IN ('.implode(', ', array_fill(0, count($agencyIds), '?')).') '
                ."THEN customers.last_contacted_at END {$direction}",
            array_map('intval', $agencyIds),
        );
    }
}
