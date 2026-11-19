<?php

namespace App\Services\Pont;

/**
 * TCK-2981 (ADR-0132 § 0) — le résultat NEUTRE d'un envoi par un pilote du pont ({@see CanalDuPont::envoyerTexte()},
 * {@see CanalDuPont::envoyerGabarit()}).
 *
 * - `envoye` : le fournisseur a accepté le message (`identifiantExterne` le désigne pour les accusés) ;
 * - `echec` : refusé ; `ambigu` dit qu'on ne sait pas s'il est parti (délai, 5xx) : **jamais de repli** (TCK-766) ;
 * - `indisponible` : rien n'a été tenté (pas de gabarit approuvé, capacité absente, intégration absente) : le repli
 *   suit, sans risque de doublon.
 */
final class ResultatDEnvoi
{
    public const ENVOYE = 'envoye';

    public const ECHEC = 'echec';

    public const INDISPONIBLE = 'indisponible';

    public function __construct(
        public readonly string $statut,
        public readonly ?string $identifiantExterne = null,
        /** `text`, `template`, `interactive`, `sms`. */
        public readonly ?string $forme = null,
        public readonly ?string $gabarit = null,
        public readonly ?string $numeroDEntreprise = null,
        public readonly bool $ambigu = false,
        public readonly ?string $motif = null,
    ) {}

    public static function indisponible(string $motif): self
    {
        return new self(self::INDISPONIBLE, motif: $motif);
    }

    public function envoye(): bool
    {
        return $this->statut === self::ENVOYE;
    }

    /** Non envoyé, et sûr de ne pas l'être : le pilote suivant de l'ordre de repli peut tenter. */
    public function peutSeReplier(): bool
    {
        return ! $this->envoye() && ! $this->ambigu;
    }
}
