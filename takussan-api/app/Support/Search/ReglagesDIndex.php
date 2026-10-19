<?php

namespace App\Support\Search;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Normalizer;

/**
 * TCK-995 (P52.02, P52.04) — les réglages d'index déclarés dans `config/scout.php`, ce qu'on envoie
 * à Meilisearch, et ce qui sépare le déclaré de ce que l'index applique.
 *
 * Lu par `search:sync-index-settings` et `search:verify-indexes`, qui résolvent les index comme
 * `scout:sync-index-settings` : un nom de classe donne `indexableAs()`, un autre nom reçoit le
 * préfixe.
 */
final class ReglagesDIndex
{
    /** Comparés comme des ensembles : Meilisearch les rend triés, l'ordre déclaré n'y compte pas. */
    private const ENSEMBLES = [
        'filterableAttributes', 'sortableAttributes', 'stopWords', 'dictionary',
        'separatorTokens', 'nonSeparatorTokens',
    ];

    /**
     * @return array<string, array{modele: class-string<Model>|null, reglages: array<string, mixed>}> par uid d'index
     */
    public static function declares(): array
    {
        $declares = [];

        foreach ((array) config('scout.meilisearch.index-settings', []) as $nom => $reglages) {
            if (! is_array($reglages)) {
                $nom = $reglages;
                $reglages = [];
            }

            $modele = class_exists($nom) ? $nom : null;

            if ($modele !== null
                && config('scout.soft_delete', false)
                && in_array(SoftDeletes::class, class_uses_recursive($modele), true)) {
                $reglages['filterableAttributes'][] = '__soft_deleted';
            }

            $uid = $modele !== null ? (new $modele)->indexableAs() : self::prefixer($nom);
            $declares[$uid] = ['modele' => $modele, 'reglages' => $reglages];
        }

        return $declares;
    }

    /**
     * Le déclaré, plus `null` pour tout réglage que l'index porte et que la configuration ne
     * déclare pas : Meilisearch le remet alors à son défaut. Sans ce `null`, le `PATCH` garde
     * l'ancienne valeur d'un réglage retiré de la configuration, et l'index déployé diverge d'un
     * index neuf sans aucun signe (P52.04).
     *
     * @param  array<string, mixed>  $declares
     * @param  array<string, mixed>  $courants  les réglages que l'index rend ; `[]` s'il n'existe pas
     * @return array<string, mixed>
     */
    public static function aEnvoyer(array $declares, array $courants): array
    {
        return $declares + array_fill_keys(array_keys(array_diff_key($courants, $declares)), null);
    }

    /**
     * @param  array<string, mixed>  $declares
     * @param  array<string, mixed>  $relus
     * @return list<string> un écart lisible par réglage déclaré que l'index n'applique pas
     */
    public static function ecarts(array $declares, array $relus): array
    {
        $ecarts = [];
        $declares = self::nfc($declares);
        $relus = self::nfc($relus);

        foreach ($declares as $cle => $attendu) {
            $relu = $relus[$cle] ?? null;

            if (! self::concorde($cle, $attendu, $relu)) {
                $ecarts[] = sprintf('%s : déclaré %s, appliqué %s', $cle, self::json($attendu), self::json($relu));
            }
        }

        return $ecarts;
    }

    private static function concorde(string $cle, mixed $attendu, mixed $relu): bool
    {
        if (in_array($cle, self::ENSEMBLES, true) && is_array($attendu) && is_array($relu)) {
            return self::ensemble($attendu) === self::ensemble($relu);
        }

        return self::inclus($attendu, $relu);
    }

    /**
     * Une liste se compare dans l'ordre (l'ordre de `searchableAttributes` et de `rankingRules` est
     * une règle de classement) ; un objet relu peut porter des clés que Meilisearch y ajoute avec
     * leur défaut.
     */
    private static function inclus(mixed $attendu, mixed $relu): bool
    {
        if (is_array($attendu) && $attendu !== [] && ! array_is_list($attendu)) {
            if (! is_array($relu)) {
                return false;
            }

            foreach ($attendu as $cle => $valeur) {
                if (! array_key_exists($cle, $relu) || ! self::inclus($valeur, $relu[$cle])) {
                    return false;
                }
            }

            return true;
        }

        return $attendu === $relu;
    }

    /** @return list<string> */
    private static function ensemble(array $valeurs): array
    {
        $cles = array_values(array_unique(array_map(self::json(...), $valeurs)));
        sort($cles);

        return $cles;
    }

    /**
     * Meilisearch rend les mots en forme décomposée (NFD) : le « à » des `stopWords` revient
     * `a` + accent combinant (mesuré sur 1.16). Les deux côtés passent en NFC avant comparaison.
     */
    private static function nfc(array $valeurs): array
    {
        array_walk_recursive($valeurs, static function (mixed &$valeur): void {
            if (is_string($valeur)) {
                $valeur = Normalizer::normalize($valeur, Normalizer::FORM_C) ?: $valeur;
            }
        });

        return $valeurs;
    }

    private static function json(mixed $valeur): string
    {
        return json_encode($valeur, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '?';
    }

    private static function prefixer(string $nom): string
    {
        $prefixe = (string) config('scout.prefix');

        return Str::startsWith($nom, $prefixe) ? $nom : $prefixe.$nom;
    }
}
