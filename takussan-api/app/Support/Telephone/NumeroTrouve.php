<?php

namespace App\Support\Telephone;

/**
 * TCK-3004 — un numéro trouvé dans un texte par {@see LectureDesNumeros::lire()}. Ses positions sont des octets du texte
 * D'ORIGINE (pas du texte replié) : un appelant les applique à la chaîne qu'il a passée, invisibles et chiffres non latins compris.
 */
final readonly class NumeroTrouve
{
    /**
     * @param  int  $debut  premier octet du numéro dans le texte d'origine
     * @param  int  $fin  octet qui suit son dernier caractère
     * @param  string  $texte  le numéro tel qu'écrit dans le texte d'origine
     * @param  ?int  $debutIndicatif  {@see Politique::Ecarter} : l'octet où commence un `+` / `00` et un indicatif écrits juste
     *                                devant, que le motif n'a pas pris (`+1 77 123 45 67 89`) ; null sinon, et sous les autres politiques
     */
    public function __construct(
        public int $debut,
        public int $fin,
        public string $texte,
        public ?int $debutIndicatif = null,
    ) {}

    /** Sa forme E.164 sénégalaise (`+221XXXXXXXXX`), ou null s'il n'en a pas une (un numéro étranger, un lien `wa.me` vers l'étranger). */
    public function e164(): ?string
    {
        return LectureDesNumeros::e164($this->texte);
    }
}
