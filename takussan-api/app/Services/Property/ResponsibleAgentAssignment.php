<?php

namespace App\Services\Property;

/**
 * TCK-603 (ADR-0059 §1) — ce que {@see ResponsibleAgentAssigner::assign()} a fait.
 */
final class ResponsibleAgentAssignment
{
    public function __construct(
        /** La désignation de TCK-504, telle que {@see PrimaryAgentDesignator} l'a rendue. */
        public readonly PrimaryAgentDesignation $designation,
        /** `false` : la cible portait déjà la marque, rien n'a été écrit. */
        public readonly bool $changed,
        /** La ligne de la cible a été créée par ce geste. */
        public readonly bool $rowCreated,
        /** Le rôle qu'avait la ligne de la cible avant d'être passée en `agent`, ou `null`. */
        public readonly ?string $previousRole,
    ) {}
}
