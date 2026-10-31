<?php

namespace App\Rules;

use App\Services\Ai\AiMoney;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2448 (ADR-0086) — un montant du socle IA arrive en chaîne décimale. Un nombre JSON est refusé :
 * PHP l'a déjà décodé en `float`, et ses derniers chiffres sont perdus avant toute validation.
 * La longueur borne une saisie abusive, elle ne fixe aucun nombre de décimales au stockage.
 */
class MontantIa implements ValidationRule
{
    private const LONGUEUR_MAX = 200;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! AiMoney::isAmount($value) || strlen($value) > self::LONGUEUR_MAX) {
            $fail('validation.decimal')->translate(['decimal' => '0+']);
        }
    }
}
