<?php

namespace App\Services\Property;

use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use Illuminate\Validation\Rule;

/**
 * TCK-2892 (ADR-0110 § 1, séjour) — l'heure d'arrivée (« à partir de ») et l'heure de départ
 * (« avant ») d'un bien loué à la nuit ou à la semaine : un SÉJOUR (`BookingKind::forProperty`).
 *
 * Facultatives, sans défaut écrit par l'API : le front affiche 14:00 / 11:00 quand elles manquent.
 * Hors séjour, elles sont INTERDITES (422), comme le coût d'entrée hors location mensuelle
 * ({@see CoutDEntree}) : les accepter puis les taire ferait croire à l'agent que la fiche les dit.
 */
final class HeuresDuSejour
{
    /** @var list<string> */
    public const CHAMPS = ['check_in_from', 'check_out_before'];

    public static function sApplique(ContractType|string|null $contrat, RentPeriod|string|null $periode): bool
    {
        $contrat = $contrat instanceof ContractType ? $contrat : ContractType::tryFrom((string) $contrat);
        $periode = $periode instanceof RentPeriod ? $periode : RentPeriod::tryFrom((string) $periode);

        return $contrat === ContractType::Rent && in_array($periode, [RentPeriod::Daily, RentPeriod::Weekly], true);
    }

    /** @return array<string, list<mixed>> */
    public static function regles(bool $applicable, bool $partiel): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $interdit = Rule::prohibitedIf(! $applicable);

        return [
            'check_in_from' => [...$base, 'date_format:H:i', $interdit],
            'check_out_before' => [...$base, 'date_format:H:i', $interdit],
        ];
    }

    /** `15:00:00` (colonne `time`) → `15:00` ; `null` reste `null`. */
    public static function lue(mixed $valeur): ?string
    {
        return $valeur === null || $valeur === '' ? null : substr((string) $valeur, 0, 5);
    }
}
