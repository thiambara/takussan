<?php

namespace App\Sorts;

use App\Services\Owners\OwnerDirectory;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2910 — `sort=-last_payout_at` du carnet des bailleurs (« Filtres et tri » du téléphone, « Dernier
 * versement ») : la date du dernier reversement au bailleur versé, dans l'agence du profil — la même
 * sous-requête que la colonne de la ligne ({@see OwnerDirectory::lastPayoutAt()}). Un bailleur jamais
 * payé passe en dernier dans les deux sens.
 *
 * Comme {@see OwnerRemainingToPaySort} : hors lecteur du relevé (`payouts.create`), la ligne ne porte
 * pas la date (`null`), et le tri ne range que par id, dans les deux sens — il ne dit rien des
 * versements.
 */
class OwnerLastPayoutSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        if (! OwnerDirectory::readsMoney(request()->user())) {
            $query->orderBy('owner_profiles.id');

            return;
        }

        $sub = OwnerDirectory::lastPayoutAt();
        $query->orderByRaw('('.$sub->toSql().') '.($descending ? 'DESC' : 'ASC').' NULLS LAST', $sub->getBindings())
            ->orderBy('owner_profiles.id');
    }
}
