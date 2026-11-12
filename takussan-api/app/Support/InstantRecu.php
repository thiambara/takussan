<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * TCK-2743 — l'instant d'une date-heure REÇUE, ramené au fuseau de l'application avant l'écriture.
 *
 * Le cast `datetime` d'Eloquent écrit l'heure MURALE de la valeur qu'on lui donne, sans la ramener à
 * UTC : `2026-11-12T11:00:00+01:00` était stocké `11:00`, l'instant d'une heure trop tard. Un
 * `Carbon::parse()` ne corrige rien — il garde le décalage reçu, et le cast écrit encore l'heure
 * murale de l'objet.
 *
 * - une valeur qui porte son décalage (`+01:00`, `Z`), ou un objet date, est l'instant qu'elle désigne ;
 * - une valeur SANS décalage se lit à l'heure de Dakar, comme aujourd'hui : son stockage ne change pas
 *   (Africa/Dakar est à UTC+0) ;
 * - `null` reste `null`.
 *
 * LA conversion du dépôt : chaque FormRequest qui reçoit une date-heure destinée à une colonne
 * `datetime` l'expose par un accesseur qui passe par ici, et la règle de validation, la comparaison
 * (« l'heure a-t-elle changé ? ») et l'écriture lisent alors le même instant. Elle ne valide rien :
 * la forme reçue est jugée par la règle `date` en amont.
 */
final class InstantRecu
{
    /** Le fuseau dans lequel se lit une date-heure reçue sans décalage. */
    public const FUSEAU_SANS_DECALAGE = 'Africa/Dakar';

    public static function utc(string|DateTimeInterface $valeur, string $fuseauSansDecalage = self::FUSEAU_SANS_DECALAGE): CarbonImmutable
    {
        $instant = $valeur instanceof DateTimeInterface
            ? CarbonImmutable::instance($valeur)
            : CarbonImmutable::parse($valeur, $fuseauSansDecalage);

        return $instant->setTimezone(config('app.timezone'));
    }

    /** {@see utc()}, `null` (ou une chaîne vide) laissé à `null`. */
    public static function ouNul(string|DateTimeInterface|null $valeur, string $fuseauSansDecalage = self::FUSEAU_SANS_DECALAGE): ?CarbonImmutable
    {
        return $valeur === null || $valeur === '' ? null : self::utc($valeur, $fuseauSansDecalage);
    }
}
