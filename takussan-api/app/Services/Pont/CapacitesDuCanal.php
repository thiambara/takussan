<?php

namespace App\Services\Pont;

/**
 * TCK-2980 (ADR-0132 § 0) — ce qu'un pilote déclare savoir faire. Le webhook générique, le relais sortant
 * (TCK-2981) et les liens (TCK-2982) choisissent d'après ces capacités, jamais d'après le nom du canal.
 */
final class CapacitesDuCanal
{
    public function __construct(
        /** Il lit des messages entrants (WhatsApp : oui ; le SMS de ce lot : non). Sans elle, son webhook rend 404. */
        public readonly bool $recoit,
        /** Il envoie un gabarit approuvé (hors fenêtre). */
        public readonly bool $gabarits,
        /** Il porte des médias. */
        public readonly bool $medias,
        /** Il rend des accusés (remis, lu). */
        public readonly bool $accuses,
        /** Il porte des boutons (de réponse, d'URL). */
        public readonly bool $boutons,
        /**
         * La fenêtre de réponse libre, en heures depuis le dernier message reçu (24 pour WhatsApp) ; `null` : toujours
         * ouverte, ou sans objet (le SMS n'a pas de réponse libre à garder).
         */
        public readonly ?int $fenetreHeures,
    ) {}
}
