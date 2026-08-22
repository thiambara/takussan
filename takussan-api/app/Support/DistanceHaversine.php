<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * La distance orthodromique en SQL — UNE seule fois pour tout le dépôt (ADR-0023).
 *
 * ## Pourquoi cette classe existe
 *
 * L'expression vivait en constante privée de `App\Services\Model\SearchService`
 * (chemin 3 d'ADR-0023). `GET /api/public/properties/map` (chemin 2) en a besoin
 * à son tour, pour que le rayon survive à la bascule liste → carte (TCK-346).
 * La recopier aurait fabriqué exactement le défaut que
 * TCK-346 venait de payer : **deux copies d'une formule dont une seule porte le
 * clamp**. Elle est donc extraite ici, et les deux appelants la partagent.
 *
 * ## ⚠⚠ `LEAST(1.0, GREATEST(-1.0, …))` n'est PAS un ornement défensif
 *
 * Sans lui, cette requête FAIT PLANTER LE JOB D'ALERTES SUR POSTGRESQL. Mesuré le
 * 2026-08-22 sur PostgreSQL 17 (`tests/Feature/Search/SearchServiceGeoTest.php`,
 * cas « un bien sans coordonnées » et « un brouillon ») :
 *
 *   SQLSTATE[22003]: Numeric value out of range: 7 ERROR: input is out of range
 *
 * L'argument d'`acos()` vaut mathématiquement 1 quand le point de recherche
 * COÏNCIDE avec les coordonnées d'un bien — le cas « des biens autour de
 * celui-ci » — et l'arithmétique flottante le rend régulièrement à
 * 1,0000000000000002. MySQL et SQLite rendaient alors NULL et la ligne était
 * simplement écartée ; PostgreSQL LÈVE. Et comme `SendSavedSearchAlerts` itère
 * par `each()`, l'exception ne perdait pas une recherche : elle tuait le job,
 * donc TOUTES les alertes suivantes.
 *
 * C'est exactement la classe de divergence qu'ADR-0020 a rendue visible en
 * amenant la suite de tests sur le moteur de production — et ce chemin n'avait
 * aucun test jusqu'à TCK-346.
 */
final class DistanceHaversine
{
    /**
     * Distance en KILOMÈTRES entre (?, ?) et les colonnes `latitude` / `longitude`
     * de la table interrogée.
     *
     * Trois liaisons, dans cet ordre : latitude d'origine, longitude d'origine,
     * latitude d'origine à nouveau. `bindings()` les compose — ne pas les écrire
     * à la main, l'ordre n'est pas devinable depuis l'expression.
     */
    public const SQL_KM = '(6371 * acos(LEAST(1.0, GREATEST(-1.0, '
        .'cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) '
        .'+ sin(radians(?)) * sin(radians(latitude))))))';

    /**
     * Les liaisons de `SQL_KM`, dans l'ordre où l'expression les consomme.
     *
     * @return array<int,float>
     */
    public static function bindings(float $lat, float $lng): array
    {
        return [$lat, $lng, $lat];
    }

    /**
     * Restreint une requête sur `addresses` aux lignes situées à moins de
     * `$rayonKm` du point (`$lat`, `$lng`).
     *
     * Une adresse sans coordonnées est EXCLUE — même règle que `_geoRadius` sur
     * `/search` (ADR-0023, § « on ne promet pas ce qu'on ne sait pas »). Les deux
     * `whereNotNull` sont explicites plutôt que déduits du `NULL` que rendrait
     * `acos(NULL)` : l'exclusion est une décision, pas un effet de bord.
     *
     * @param  Builder  $q  la sous-requête `addresses` (typiquement dans un `whereHas('address', …)`)
     */
    public static function restreindreAuRayonKm(Builder $q, float $lat, float $lng, float $rayonKm): void
    {
        $q->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereRaw(self::SQL_KM.' <= ?', [...self::bindings($lat, $lng), $rayonKm]);
    }
}
