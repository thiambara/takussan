<?php

namespace Database\Seeders\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Helpers for placing entities along a 13-month timeline. All methods return
 * immutable Carbon instances to make date arithmetic safer in nested loops.
 */
class Timeline
{
    /** Months of historical activity to simulate. */
    public const MONTHS_OF_HISTORY = 13;

    /** Ancienneté du portefeuille avant la fenêtre, en mois — cf. {@see portfolioStart()}. */
    public const MONTHS_OF_PORTFOLIO = 24;

    /** Part des biens publiés et des clients qui précèdent la fenêtre, en %. */
    public const PART_DU_PORTEFEUILLE = 30;

    public static function seedStart(): CarbonImmutable
    {
        return CarbonImmutable::now()
            ->startOfDay()
            ->subMonths(self::MONTHS_OF_HISTORY);
    }

    /**
     * Le début du portefeuille : une agence fondée des années avant la fenêtre y entre avec des biens
     * et des clients déjà là (TCK-2377). Sans eux, aucun bail d'un an n'avait le temps d'expirer ni
     * d'être renouvelé dans une fenêtre de 13 mois.
     */
    public static function portfolioStart(): CarbonImmutable
    {
        return self::seedStart()->subMonths(self::MONTHS_OF_PORTFOLIO);
    }

    /**
     * Une date de création : dans le portefeuille d'avant la fenêtre pour `$partAncienne` % des cas,
     * dans la fenêtre sinon, à un rythme qui croît (cf. {@see dateCroissante()}).
     */
    public static function creation(int $partAncienne, CarbonInterface $finDeFenetre): CarbonImmutable
    {
        return mt_rand(1, 100) <= $partAncienne
            ? self::randomDateBetween(self::portfolioStart(), self::seedStart())
            : self::dateCroissante(self::seedStart(), $finDeFenetre);
    }

    /**
     * Une date dont la densité croît linéairement de `$from` à `$to` : une activité qui monte
     * (TCK-2378). Le dernier tiers de l'intervalle reçoit 5/9 des tirages, le premier 1/9 — un tirage
     * uniforme leur en donnait un tiers chacun.
     */
    public static function dateCroissante(CarbonInterface $from, CarbonInterface $to): CarbonImmutable
    {
        $fromTs = $from->getTimestamp();
        $toTs = $to->getTimestamp();
        if ($toTs <= $fromTs) {
            return CarbonImmutable::createFromTimestamp($fromTs);
        }

        return CarbonImmutable::createFromTimestamp($fromTs + (int) (($toTs - $fromTs) * sqrt(mt_rand() / mt_getrandmax())));
    }

    public static function seedEnd(): CarbonImmutable
    {
        return CarbonImmutable::now()->endOfDay();
    }

    public static function randomDateBetween(
        CarbonInterface $from,
        CarbonInterface $to,
    ): CarbonImmutable {
        $fromTs = $from->getTimestamp();
        $toTs = $to->getTimestamp();
        if ($toTs <= $fromTs) {
            return CarbonImmutable::createFromTimestamp($fromTs);
        }
        $ts = mt_rand($fromTs, $toTs);

        return CarbonImmutable::createFromTimestamp($ts);
    }

    /**
     * Return a date within the seed window with a time jittered between
     * 08:00 and 18:59 local time — useful for simulating business activity.
     */
    public static function businessHour(CarbonInterface $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date)
            ->setTime(mt_rand(8, 18), mt_rand(0, 59), mt_rand(0, 59));
    }

    /**
     * @return iterable<CarbonImmutable> starts of each month in [$from, $to].
     */
    public static function monthlyBuckets(
        CarbonInterface $from,
        CarbonInterface $to,
    ): iterable {
        $cursor = CarbonImmutable::parse($from)->startOfMonth();
        $end = CarbonImmutable::parse($to)->startOfMonth();
        while ($cursor->lessThanOrEqualTo($end)) {
            yield $cursor;
            $cursor = $cursor->addMonth();
        }
    }
}
