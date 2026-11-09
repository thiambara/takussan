<?php

namespace App\Services\Search\Query;

/**
 * TCK-2496 — un {@see PlaceLexicon} augmenté de quelques écritures : le lexique d'origine, plus des lieux que l'appelant
 * a reconnus ailleurs (la suggestion : un lieu mal écrit que l'index des suggestions a trouvé). Le plus long des deux
 * l'emporte, comme dans un lexique unique ; à longueur égale, le lexique d'origine.
 */
final readonly class PlaceLexiconAvecLieuxEnPlus implements PlaceLexicon
{
    public function __construct(
        private PlaceLexicon $origine,
        private PlaceLexicon $enPlus,
    ) {}

    public function longestMatch(array $words): ?array
    {
        $origine = $this->origine->longestMatch($words);
        $enPlus = $this->enPlus->longestMatch($words);

        if ($enPlus === null || ($origine !== null && $origine['length'] >= $enPlus['length'])) {
            return $origine;
        }

        return $enPlus;
    }
}
