<?php

namespace App\Services\Property;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Validation\Rule;

/**
 * TCK-598 (V9, contrainte 8) — ce qu'un locataire verse pour emménager : avance, caution, frais
 * d'agence, charges. **Une seule définition** : la ressource, les règles de validation et la
 * duplication la lisent ; aucun écran ne refait l'addition.
 *
 *     total = (loyer + charges) × mois d'avance + loyer × mois de caution + loyer × mois de frais
 *
 * Il ne s'applique qu'à une location MENSUELLE : à la semaine ou à la nuit, « un mois de caution »
 * n'a pas de sens, et sur une vente le mot n'en a aucun. Les colonnes vides comptent pour 0, mais
 * le bloc entier vaut `null` si les quatre sont vides — absent, et non « 0 F à l'entrée ».
 *
 * Le total est arrondi à l'unité de la devise, la moitié vers le haut — la règle de
 * `PaymentGatewayService::amountDue()` (TCK-593) : aucune décimale en franc CFA (principe n°3).
 */
final class CoutDEntree
{
    public const MOIS_MAX = 24;

    /** @var list<string> */
    public const CHAMPS = ['deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges'];

    public static function sApplique(ContractType|string|null $contrat, RentPeriod|string|null $periode): bool
    {
        $contrat = $contrat instanceof ContractType ? $contrat : ContractType::tryFrom((string) $contrat);
        $periode = $periode instanceof RentPeriod ? $periode : RentPeriod::tryFrom((string) $periode);

        // L'invariant de `Property::booted()` : une location sans période EST mensuelle.
        return $contrat === ContractType::Rent && ($periode ?? RentPeriod::Monthly) === RentPeriod::Monthly;
    }

    /**
     * @return array{deposit_months: int|null, advance_months: int|null, agency_fee_months: float|null, monthly_charges: float|null, total: float}|null
     */
    public static function pour(Property $property): ?array
    {
        if (! self::sApplique($property->contract_type, $property->rent_period)) {
            return null;
        }

        $caution = $property->deposit_months;
        $avance = $property->advance_months;
        $frais = $property->agency_fee_months;
        $charges = $property->monthly_charges;

        if ($caution === null && $avance === null && $frais === null && $charges === null) {
            return null;
        }

        $loyer = (float) $property->price;
        $total = ($loyer + (float) $charges) * (int) $avance
            + $loyer * (int) $caution
            + $loyer * (float) $frais;

        return [
            'deposit_months' => $caution,
            'advance_months' => $avance,
            'agency_fee_months' => $frais !== null ? (float) $frais : null,
            'monthly_charges' => $charges !== null ? (float) $charges : null,
            'total' => round($total, Currency::decimalPlacesOf($property->currency), PHP_ROUND_HALF_UP),
        ];
    }

    /**
     * Les règles des quatre champs. Hors location mensuelle, ils sont INTERDITS (422) : les
     * accepter puis les taire ferait croire à l'agent que la fiche les affiche.
     *
     * @return array<string, list<mixed>>
     */
    public static function regles(bool $applicable, bool $partiel): array
    {
        $base = $partiel ? ['sometimes', 'nullable'] : ['nullable'];
        $interdit = Rule::prohibitedIf(! $applicable);

        return [
            'deposit_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'advance_months' => [...$base, 'integer', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'agency_fee_months' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:'.self::MOIS_MAX, $interdit],
            'monthly_charges' => [...$base, 'numeric', 'decimal:0,2', 'min:0', 'max:999999999999', $interdit],
        ];
    }
}
