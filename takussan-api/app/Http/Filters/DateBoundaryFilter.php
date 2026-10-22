<?php

namespace App\Http\Filters;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Validator;
use Spatie\QueryBuilder\Filters\Filter;

/**
 * P119.02 (TCK-1271) — une borne de plage de dates sur une colonne horodatée
 * (`filter[date_from]`, `filter[date_to]`), lue de la même façon par les trois lectures du journal.
 *
 * `?filter[date_to]=2026-04-22` compilerait sinon en `created_at <= 2026-04-22 00:00:00` et
 * perdrait toutes les lignes du jour choisi : le sélecteur de date envoie `yyyy-MM-dd`. Une date
 * seule (sans heure) s'étend au début du jour pour une borne basse, à sa fin pour une borne haute ;
 * une date et heure passe telle quelle. Extrait d'`AuditLogController::normalizeRangeBoundary()`,
 * qui l'appliquait seul au journal de l'agence. Une valeur illisible rend 422 (P119.03, TCK-1273).
 */
class DateBoundaryFilter implements Filter
{
    public function __construct(
        private readonly string $column,
        private readonly bool $isUpperBound,
    ) {}

    public function __invoke(Builder $query, mixed $value, string $property): void
    {
        // P119.03 (TCK-1273) — une date illisible, ou une liste (spatie découpe sur la virgule),
        // rend 422 par la règle `date` des requêtes d'export, au lieu de lever en 500 dans
        // `Carbon::parse()` ou dans PostgreSQL.
        self::exiger($value, $property);

        $query->where($this->column, $this->isUpperBound ? '<=' : '>=', self::normalize($value, $this->isUpperBound));
    }

    /**
     * La règle `date`, pour une borne de date lue hors de ce filtre (P151.04, TCK-1405 : les biens,
     * l'historique des paiements, la modération des agences) : 422 sur une valeur illisible ou une
     * liste, au lieu d'un 500 levé par `Carbon::parse()` ou par PostgreSQL.
     */
    public static function exiger(mixed $value, string $property): void
    {
        Validator::make(['filter' => [$property => $value]], ["filter.{$property}" => ['string', 'date']])->validate();
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
