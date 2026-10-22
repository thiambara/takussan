<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * TCK-1455 (P163.03) — une fin donnée en DATE SEULE est inclusive : `2026-10-25` désigne le dernier
 * jour, et la borne tombe à la fin de ce jour, heure de Dakar (décision du porteur, P128.01,
 * TCK-1320). Rangée telle quelle, elle tomberait à 00:00 au DÉBUT du jour annoncé. Un instant
 * explicite (`2026-10-25 23:59:59`, ISO 8601) est rendu sans changement.
 *
 * Une seule forme pour la délégation de rôle et l'absence d'agent, qui partagent la table
 * `role_delegations` : la règle vivait dans le service de la première et dans l'écran de la seconde.
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

        return $fin;
    }
}
