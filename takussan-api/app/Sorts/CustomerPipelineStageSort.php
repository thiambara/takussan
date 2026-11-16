<?php

namespace App\Sorts;

use App\Models\Enums\CustomerPipelineStage;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Sorts\Sort;

/**
 * TCK-2889 — `sort=pipeline_stage` : par le RANG de l'étape dans le pipeline (l'ordre des cas de
 * {@see CustomerPipelineStage} : nouveau, prospect, qualifié, négociation, gagné, perdu), jamais par
 * l'ordre alphabétique des codes (« converted » passerait avant « lead »). Une valeur inconnue de
 * l'enum se range en dernier. Le départage par identifiant est posé par `DepartageQueryBuilder`.
 */
class CustomerPipelineStageSort implements Sort
{
    public function __invoke(Builder $query, bool $descending, string $property): void
    {
        $cases = [];
        $bindings = [];
        foreach (CustomerPipelineStage::cases() as $rang => $etape) {
            $cases[] = 'WHEN ? THEN '.$rang;
            $bindings[] = $etape->value;
        }

        $query->orderByRaw(
            'CASE "customers"."pipeline_stage" '.implode(' ', $cases).' ELSE '.count($cases).' END '.($descending ? 'DESC' : 'ASC'),
            $bindings,
        );
    }
}
