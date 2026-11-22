<?php

namespace App\Sorts;

use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2640 — `sort=name` du carnet des bailleurs : le nom affiché, celui du compte, sinon celui saisi
 * à l'invitation (la règle d'`OwnerProfile::display_name`). Collation ICU racine
 * ({@see CaseInsensitive::COLLATION}) : `élise` se range avec les `e`, pas après `z` comme sous
 * `--locale=C`. Un profil sans nom passe en dernier dans les deux sens.
 */
class OwnerNameSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $name = "COALESCE(NULLIF(TRIM((SELECT CONCAT_WS(' ', users.first_name, users.last_name) FROM users WHERE users.id = owner_profiles.user_id)), ''), "
            ."NULLIF(TRIM(CONCAT_WS(' ', owner_profiles.metadata->>'first_name', owner_profiles.metadata->>'last_name')), ''))";

        $query->orderByRaw(sprintf('%s COLLATE "%s" %s NULLS LAST', $name, CaseInsensitive::COLLATION, $descending ? 'DESC' : 'ASC'));
    }
}
