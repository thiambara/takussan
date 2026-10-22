<?php

namespace App\Http\Filters;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Spatie\QueryBuilder\Filters\Filter;

/**
 * P119.02 (TCK-1271) — une borne de plage de dates sur une colonne horodatée
 * (`filter[date_from]`, `filter[date_to]`), lue de la même façon par les trois lectures du journal.
 *
 * `?filter[date_to]=2026-04-22` compilerait sinon en `created_at <= 2026-04-22 00:00:00` et
 * perdrait toutes les lignes du jour choisi : le sélecteur de date envoie `yyyy-MM-dd`. Une date
 * seule (sans heure) s'étend au début du jour pour une borne basse, à sa fin pour une borne haute ;
 * une date et heure passe telle quelle. Extrait d'`AuditLogController::normalizeRangeBoundary()`,
 * qui l'appliquait seul au journal de l'agence.
 */
class DateBoundaryFilter implements Filter
{
    public function __construct(
        private readonly string $column,
        private readonly bool $isUpperBound,
    ) {}

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        $query->where($this->column, $this->isUpperBound ? '<=' : '>=', self::normalize($value, $this->isUpperBound));
    }

    public static function normalize(string $value, bool $isUpperBound): string
    {
        $parsed = Carbon::parse($value);

        if (! str_contains($value, ':')) {
            return ($isUpperBound ? $parsed->endOfDay() : $parsed->startOfDay())->toDateTimeString();
        }

        return $parsed->toDateTimeString();
    }
}
