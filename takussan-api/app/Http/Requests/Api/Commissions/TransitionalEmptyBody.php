<?php

namespace App\Http\Requests\Api\Commissions;

/**
 * TCK-2661 — transition, retiré par TCK-2662.
 *
 * Le registre du front d'aujourd'hui (`CommissionsLedger`) poste `mark-paid` et `cancel` avec un
 * corps VIDE. Tant que TCK-2662 ne l'a pas remplacé, un corps vide garde exactement le comportement
 * d'avant TCK-2661 (payée maintenant sans preuve, annulée sans motif, aucune notification) ; dès
 * qu'un corps est envoyé, les règles de TCK-2661 s'appliquent en entier. L'autorisation, elle,
 * précède toujours.
 */
trait TransitionalEmptyBody
{
    public function isTransitionalEmptyBody(): bool
    {
        return $this->getInputSource()->count() === 0;
    }
}
