<?php

namespace App\Models\Enums;

use App\Support\Search\PropertyLabels;

/**
 * TCK-508 — l'état DÉCLARÉ d'un bien bâti (docs/models-spec.md#3-property).
 *
 * ⚠ Ce n'est pas {@see InventoryCondition} : celui-là décrit l'état physique relevé
 * pièce par pièce lors d'un état des lieux, celui-ci le positionnement d'une annonce.
 * Deux sens, deux enums — les confondre mettrait « à rénover » sur un bail en cours.
 */
enum PropertyCondition: string
{
    case OffPlan = 'off_plan';
    case New = 'new';
    case Renovated = 'renovated';
    case Good = 'good';
    case ToRenovate = 'to_renovate';

    /**
     * Un terrain ou une ferme n'a pas d'état. La frontière est la famille foncière de
     * {@see PropertyLabels::FAMILLES}, et non une seconde liste de types qui
     * divergerait au premier type ajouté. Un type encore inconnu n'efface rien.
     */
    public static function appliesTo(PropertyType|string|null $type): bool
    {
        return PropertyLabels::famille($type) !== PropertyLabels::FAMILLE_FONCIER;
    }

    /** Ce que la recherche entend par « neuf » : livré neuf, ou vendu sur plan. */
    public function isNewBuild(): bool
    {
        return $this === self::New || $this === self::OffPlan;
    }
}
