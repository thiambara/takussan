<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * TCK-1455 (P163.03) — une fin donnée en DATE SEULE est inclusive : `2026-10-25` désigne le dernier
 * jour, et la borne tombe à la fin de ce jour, heure de Dakar (décision du porteur, P128.01,
 * TCK-1320). Rangée telle quelle, elle tomberait à 00:00 au DÉBUT du jour annoncé.
 *
 * TCK-2743 — un instant explicite (`2026-10-25 23:59:59`, ISO 8601, ou un objet date) est l'instant
 * qu'il désigne, par LA conversion du dépôt ({@see InstantRecu}) : `…T18:00:00+01:00` est 17:00 UTC.
 * Rendu tel quel, le cast `datetime` en écrivait l'heure murale, une heure trop tard. Un champ lu
 * par cette fonction ne passe donc JAMAIS par `instantsRecus()` d'une FormRequest : converti en amont,
 * une date seule y arriverait en objet (minuit) et perdrait sa fin de jour.
 *
 * Une seule forme pour la délégation de rôle et l'absence d'agent, qui partagent la table
 * `role_delegations` : la règle vivait dans le service de la première et dans l'écran de la seconde.
 * TCK-1731 (P163.01) : la validité d'une offre d'achat (`bookings.expires_at`) suit la même règle.
 */
final class FinInclusive
{
    /** Fuseau dans lequel une date de fin sans heure se lit. */
    public const TIMEZONE = 'Africa/Dakar';

    public static function de(mixed $fin): mixed
    {
        if (is_string($fin) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fin) === 1) {
            return Carbon::createFromFormat('Y-m-d', $fin, self::TIMEZONE)->endOfDay();
        }

        if ((is_string($fin) && $fin !== '') || $fin instanceof DateTimeInterface) {
            return Carbon::instance(InstantRecu::utc($fin, self::TIMEZONE));
        }

        return $fin;
    }
}
