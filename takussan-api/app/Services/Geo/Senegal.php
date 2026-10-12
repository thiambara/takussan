<?php

namespace App\Services\Geo;

/**
 * TCK-633 (ADR-0062 §5) — le cadre du Sénégal. Une position hors de lui est SIGNALÉE, jamais
 * refusée : un bien peut se trouver ailleurs, mais c'est le plus souvent une inversion
 * latitude/longitude. Le même cadre vit côté front (`CADRE_SENEGAL`).
 */
final class Senegal
{
    public const LAT_MIN = 12.2;

    public const LAT_MAX = 16.8;

    public const LNG_MIN = -17.6;

    public const LNG_MAX = -11.3;

    public static function contient(float $latitude, float $longitude): bool
    {
        return $latitude >= self::LAT_MIN && $latitude <= self::LAT_MAX
            && $longitude >= self::LNG_MIN && $longitude <= self::LNG_MAX;
    }
}
