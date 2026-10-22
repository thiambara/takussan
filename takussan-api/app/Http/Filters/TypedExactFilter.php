<?php

namespace App\Http\Filters;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Spatie\QueryBuilder\Filters\FiltersExact;

/**
 * TCK-1411 (P151.03) — le filtre exact d'une colonne ENTIÈRE ou BOOLÉENNE qui n'est pas un
 * identifiant : la valeur est jugée par la règle `integer` ou `boolean` du validateur (422, comme
 * `DateBoundaryFilter`) avant d'atteindre PostgreSQL, qui en faisait une 500 (`22P02`).
 *
 * Le type se déclare dans le modèle (`$requestFilterableTypes`), pas au cast : `bedrooms`,
 * `bathrooms` ou `assigned_to` n'en ont pas. Un identifiant déclaré passe par
 * `ExactIdentifierFilter` (400). Une liste (`1,2`) est jugée élément par élément.
 */
class TypedExactFilter extends FiltersExact
{
    public const IDENTIFIANT = 'identifiant';

    public const ENTIER = 'entier';

    public const BOOLEEN = 'booléen';

    public function __construct(private readonly string $type)
    {
        parent::__construct();
    }

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        $regle = $this->type === self::BOOLEEN ? 'boolean' : 'integer';
        $cle = is_array($value) ? "filter.{$property}.*" : "filter.{$property}";

        Validator::make(['filter' => [$property => $value]], [$cle => [$regle]])->validate();

        parent::__invoke($query, $value, $property);
    }
}
