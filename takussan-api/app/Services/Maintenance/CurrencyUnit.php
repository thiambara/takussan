<?php

namespace App\Services\Maintenance;

use App\Models\Enums\Currency;
use App\Models\MaintenanceRequest;

/**
 * TCK-592 — l'arrondi d'un montant d'intervention à l'unité de sa devise, en un seul endroit : les
 * lignes et le total d'un devis (verif-592, mineur 1), et le coût saisi au `PATCH` ou à la fin des
 * travaux (verif-592 passe 2, N5). Au plus proche, la moitié en s'éloignant de zéro ; 0 décimale
 * pour le XOF.
 *
 * Le montant reçu est DÉCIMAL : la règle `decimal:0,2` des FormRequest écarte la notation
 * scientifique (`5e5`), sur laquelle bcmath lève `ValueError` — une 500 au premier plafond lu.
 */
final class CurrencyUnit
{
    /** Rendu sur 2 décimales, l'échelle des colonnes. */
    public static function round(string $amount, int $scale): string
    {
        $half = bcdiv('5', bcpow('10', (string) ($scale + 1)), $scale + 1);
        $rounded = bccomp($amount, '0', 4) < 0
            ? bcsub($amount, $half, $scale)
            : bcadd($amount, $half, $scale);

        return bcadd($rounded, '0', 2);
    }

    /** Le coût saisi d'une demande, arrondi à l'unité de sa devise (celle du devis, sinon XOF). */
    public static function cost(MaintenanceRequest $mr, int|float|string $amount): string
    {
        $currency = Currency::tryFrom((string) $mr->quote_currency) ?? Currency::XOF;

        return self::round(is_string($amount) ? trim($amount) : (string) $amount, $currency->decimalPlaces());
    }
}
