<?php

namespace App\Support;

/**
 * TCK-537 (décision du porteur du 2026-11-16) — le nom d'une personne MONTRÉE AU PUBLIC : son
 * prénom et l'initiale de son nom (« Awa N. »), jamais son nom entier. Minimisation de la loi
 * n° 2008-12 (des données adéquates, pertinentes et non excessives) : un avis publié n'a
 * pas besoin du nom de famille de son auteur pour être lu.
 *
 * Le nom de famille ne sort jamais en entier, quel que soit le chemin :
 *  - prénom posé → « Prénom N. » (ou le prénom seul, sans nom) ;
 *  - prénom absent, nom posé → « N. » ;
 *  - ni l'un ni l'autre → le `username`, réduit de même : la partie avant un `@` (un identifiant
 *    peut être une adresse), coupée aux blancs, points, tirets et soulignés — « awa.ndiaye » rend
 *    « awa N. », jamais « awa.ndiaye » ;
 *  - rien → `null` (le front écrit « Anonyme » dans la langue du lecteur, TCK-1781).
 */
final class NomPublic
{
    public static function abrege(?string $prenom, ?string $nom, ?string $username = null): ?string
    {
        $prenom = trim((string) $prenom);
        $nom = trim((string) $nom);

        if ($prenom !== '') {
            return $nom === '' ? $prenom : $prenom.' '.self::initiale($nom);
        }

        if ($nom !== '') {
            return self::initiale($nom);
        }

        $identifiant = trim((string) $username);
        $arobase = mb_strpos($identifiant, '@');
        if ($arobase !== false) {
            $identifiant = mb_substr($identifiant, 0, $arobase);
        }

        $morceaux = preg_split('/[\s._\-]+/u', $identifiant, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($morceaux === []) {
            return null;
        }

        $premier = array_shift($morceaux);

        return $morceaux === [] ? $premier : $premier.' '.self::initiale((string) end($morceaux));
    }

    /** « ndiaye » → « N. », « Élise » → « É. » : la première lettre, en capitale, multioctet. */
    private static function initiale(string $mot): string
    {
        return mb_strtoupper(mb_substr($mot, 0, 1)).'.';
    }
}
