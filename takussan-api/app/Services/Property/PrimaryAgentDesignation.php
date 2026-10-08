<?php

namespace App\Services\Property;

use App\Models\PropertyCollaborator;

/**
 * TCK-504 (ADR-0053 §3) — ce que {@see PrimaryAgentDesignator::designate()} a fait.
 */
final class PrimaryAgentDesignation
{
    public function __construct(
        /** La ligne qui porte désormais la marque, relue sous le verrou. */
        public readonly PropertyCollaborator $primary,
        /** La ligne qui portait la marque avant, ou `null` si aucune ne la portait. */
        public readonly ?PropertyCollaborator $previous,
        /** Qui répondait pour le bien avant le geste — par la marque ou par le repli. */
        public readonly ?int $previousContactUserId,
        /** `false` : la cible portait déjà la marque, rien n'a été écrit. */
        public readonly bool $changed,
    ) {}
}
