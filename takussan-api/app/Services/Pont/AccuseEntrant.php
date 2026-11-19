<?php

namespace App\Services\Pont;

/** TCK-2980 (ADR-0132 § 0) — un accusé reçu (remis, lu, échec), en forme neutre. */
final class AccuseEntrant
{
    public function __construct(
        /** L'identifiant externe du message envoyé que l'accusé vise. */
        public readonly string $identifiant,
        /** Le statut tel que le fournisseur le nomme (`sent`, `delivered`, `read`, `failed`…). */
        public readonly string $statut,
        /** L'horodatage du fournisseur (secondes Unix), s'il en donne un. */
        public readonly ?int $horodatage = null,
        /** Le motif d'un échec, borné. */
        public readonly ?string $motif = null,
    ) {}
}
