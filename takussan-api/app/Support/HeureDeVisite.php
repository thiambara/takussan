<?php

namespace App\Support;

use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * TCK-590 — l'heure d'une visite telle qu'un message la donne : à Dakar, et SUIVIE du fuseau.
 *
 * Les notifications écrivaient `scheduled_at->format('Y-m-d H:i')` : l'heure UTC du serveur, sans
 * fuseau. Dakar étant à UTC+0 elle était juste par coïncidence, et illisible pour qui lit depuis
 * un autre fuseau. Le gabarit (`notifications.visit_time`) et la date (`isoFormat('LL')`, celle de
 * la locale) appartiennent à la langue : aucun format figé ici (TCK-347).
 */
final class HeureDeVisite
{
    public static function pour(?CarbonInterface $instant, ?string $locale = null): string
    {
        if ($instant === null) {
            return '—';
        }

        $locale ??= app()->getLocale();
        $local = CarbonImmutable::instance($instant)->setTimezone(VisitSchedulingService::TIMEZONE)->locale($locale);

        return __('notifications.visit_time', [
            'date' => $local->isoFormat('LL'),
            'time' => $local->format('H:i'),
        ], $locale);
    }
}
