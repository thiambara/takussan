<?php

namespace App\Services\Geo;

/**
 * TCK-633 (AC9) — les coordonnées écrites dans un lien Google Maps, SANS réseau.
 *
 * Ordre : le repère de la fiche (`!3d…!4d…`) d'abord — le `@` n'est que le CENTRE de la carte
 * affichée, souvent décalé du lieu —, puis les paramètres `q`, `query`, `ll`, `center`,
 * `destination`, puis le `@lat,lng`.
 *
 * ⚠ Jumelle de `coordonneesDepuisLienGoogle` (`takussan-web/src/lib/geo/reconnaitre-position.ts`) :
 * les deux lisent `tests/fixtures/liens-google-maps.json`.
 */
final class GoogleMapsCoordinates
{
    private const LAT = '(-?\d{1,2}(?:\.\d+)?)';

    private const LNG = '(-?\d{1,3}(?:\.\d+)?)';

    /** @var list<string> */
    private const PARAMETRES = ['q', 'query', 'll', 'center', 'destination'];

    /** @return array{latitude: float, longitude: float}|null */
    public static function depuisUrl(string $url): ?array
    {
        $decode = rawurldecode($url);

        if (preg_match('/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/', $decode, $m) === 1) {
            return self::valider($m[1], $m[2]);
        }

        parse_str((string) parse_url($url, PHP_URL_QUERY), $parametres);
        foreach (self::PARAMETRES as $cle) {
            $valeur = $parametres[$cle] ?? null;
            if (is_string($valeur) && preg_match('/^\s*'.self::LAT.'\s*,\s*'.self::LNG.'\s*$/', $valeur, $m) === 1) {
                return self::valider($m[1], $m[2]);
            }
        }

        if (preg_match('#/@'.self::LAT.','.self::LNG.'(?:,|$|/|\?)#', $decode, $m) === 1) {
            return self::valider($m[1], $m[2]);
        }

        return null;
    }

    /** @return array{latitude: float, longitude: float}|null */
    private static function valider(string $lat, string $lng): ?array
    {
        if (! is_numeric($lat) || ! is_numeric($lng)) {
            return null;
        }
        $latitude = (float) $lat;
        $longitude = (float) $lng;
        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            return null;
        }

        return ['latitude' => $latitude, 'longitude' => $longitude];
    }
}
