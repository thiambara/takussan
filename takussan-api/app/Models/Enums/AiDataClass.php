<?php

namespace App\Models\Enums;

/**
 * TCK-2383 (ADR-0076 §4) — la classe des données d'une charge envoyée à un fournisseur. Un usage
 * déclare la plus haute qu'il peut envoyer ; `Sensible` (pièce d'identité, revenu : ADR-0070) ne
 * part jamais, quel que soit l'usage.
 */
enum AiDataClass: string
{
    case Publique = 'publique';
    case Personnelle = 'personnelle';
    case Sensible = 'sensible';

    public function rank(): int
    {
        return match ($this) {
            self::Publique => 0,
            self::Personnelle => 1,
            self::Sensible => 2,
        };
    }
}
