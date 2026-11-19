<?php

namespace App\Services\Pont;

use Carbon\CarbonInterface;

/**
 * TCK-2981 (ADR-0132 § 3) — ce qu'un pilote sait d'un numéro, pour l'écran du personnel (`GET …/context`, bloc
 * `pont`) : l'accord et ses dates, la fin de la fenêtre de texte libre. Jamais le numéro lui-même.
 */
final class EtatDuNumero
{
    public function __construct(
        public readonly EtatDAccord $accord = EtatDAccord::Inconnu,
        public readonly ?CarbonInterface $accordLe = null,
        public readonly ?CarbonInterface $oppositionLe = null,
        /** La fin de la fenêtre de texte libre ; `null` : fermée, ou le canal n'en a pas. */
        public readonly ?CarbonInterface $fenetreJusquA = null,
    ) {}
}
