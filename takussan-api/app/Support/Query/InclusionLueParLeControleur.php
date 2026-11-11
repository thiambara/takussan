<?php

namespace App\Support\Query;

use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Includes\IncludeInterface;

/**
 * TCK-2627 — un `include=` que spatie ACCEPTE sans rien charger : ce qu'il nomme n'est pas une
 * relation, et le contrôleur le lit lui-même, en une requête pour toute la page (les déclenchements
 * d'une alerte vivent dans le journal d'activité, pas dans une table liée). Sans cette déclaration,
 * spatie refuse le paramètre en 400.
 */
final class InclusionLueParLeControleur implements IncludeInterface
{
    public function __invoke(Builder $query, string $include): void {}
}
