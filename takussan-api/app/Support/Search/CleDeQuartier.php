<?php

namespace App\Support\Search;

use Illuminate\Support\Str;

/**
 * TCK-663 (piste P01.02) — la forme sous laquelle deux noms de quartier se comparent dans le filtre
 * `location` : minuscules, sans accent, et tout ce qui n'est ni lettre ni chiffre (tiret, apostrophe,
 * espaces répétés) ramené à une espace.
 *
 *   « Grand-Yoff », « Grand Yoff », « grand  yoff »  → `grand yoff`
 *   « Guédiawaye », « GUEDIAWAYE »                   → `guediawaye`
 *   « Sacré-Cœur 3 »                                 → `sacre coeur 3`
 *
 * Calculée en PHP, jamais en SQL : la base ne replie pas les accents (ADR-0020 §2, ADR-0025, sans
 * `unaccent`), et ce repli-ci ne vaut que pour le filtre de quartier, pas pour une contrainte.
 * Le texte des adresses n'est pas réécrit : la clé est indexée à côté (`neighborhood_key`).
 *
 * ⚠ Ce fichier entre dans l'empreinte `.search-shape` (Dockerfile) : le modifier réimporte les
 * biens au déploiement suivant, ce qui est voulu — la clé indexée doit suivre la règle.
 */
final class CleDeQuartier
{
    public static function de(?string $nom): ?string
    {
        if ($nom === null) {
            return null;
        }

        $cle = trim((string) preg_replace('/[^a-z0-9]+/', ' ', Str::ascii(mb_strtolower($nom))));

        return $cle === '' ? null : $cle;
    }
}
