<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * TCK-864 (P02.06) — les bornes d'un jour calendaire, pour filtrer un horodatage en plage.
 *
 * `whereDate()` compile en `"col"::date >= ?` sous PostgreSQL, et le cast interdit l'usage d'un
 * index sur la colonne. Sur un `timestamp without time zone` écrit dans le fuseau de l'application
 * (UTC, `config/app.php`), `col::date >= J` équivaut à `col >= début(J)` et `col::date <= J` à
 * `col < lendemain(J)`.
 *
 * Le jour se lit comme `whereDate()` le lisait : un `DateTimeInterface` par sa date (`Y-m-d`),
 * dans son propre fuseau ; une chaîne par la date qu'elle écrit, l'heure et le décalage ignorés.
 */
final class DayRange
{
    /** Minuit du jour `$day`, borne incluse. */
    public static function start(DateTimeInterface|string $day): Carbon
    {
        return Carbon::createFromFormat('!Y-m-d', self::date($day), config('app.timezone'));
    }

    /** Minuit du lendemain de `$day`, borne exclue. */
    public static function after(DateTimeInterface|string $day): Carbon
    {
        return self::start($day)->addDay();
    }

    private static function date(DateTimeInterface|string $day): string
    {
        return $day instanceof DateTimeInterface
            ? $day->format('Y-m-d')
            : Carbon::parse($day)->format('Y-m-d');
    }
}
