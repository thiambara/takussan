<?php

namespace Database\Seeders\Support;

use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * Les tirages au hasard des seeders, tous sur la graine du seed (TCK-2380).
 *
 * Faker et `mt_rand()` partagent l'état que `mt_srand()` initialise — c'est ce que fait
 * {@see SeedingContext::bootFaker()}. Mais `random_int()` et `Str::random()` lisent le générateur
 * cryptographique, et `Collection::random()` / `shuffle()` un `Random\Randomizer` sécurisé : aucun
 * des trois ne se rejoue. Deux seeds de suite ne donnaient donc pas le même jeu, et une capture ou
 * un défaut vu sur une base semée ne se reproduisait pas.
 *
 * Tout tirage d'un seeder passe par ici ou par le Faker du contexte. `mt_rand()` direct reste
 * permis : il est sur la même graine.
 */
final class Tirage
{
    private const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /** Initialise la graine de tous les tirages — Faker compris. */
    public static function graine(int $graine): void
    {
        mt_srand($graine, MT_RAND_MT19937);
    }

    /**
     * Un élément, comme `Collection::random()`.
     *
     * @template T
     *
     * @param  Collection<array-key, T>|array<array-key, T>  $elements
     * @return T
     */
    public static function un(Collection|array $elements): mixed
    {
        $valeurs = array_values($elements instanceof Collection ? $elements->all() : $elements);
        if ($valeurs === []) {
            throw new InvalidArgumentException('Tirage dans un ensemble vide.');
        }

        return $valeurs[mt_rand(0, count($valeurs) - 1)];
    }

    /**
     * `$nombre` éléments distincts, comme `Collection::random($nombre)`.
     *
     * @template T
     *
     * @param  Collection<array-key, T>  $elements
     * @return Collection<int, T>
     */
    public static function plusieurs(Collection $elements, int $nombre): Collection
    {
        if ($nombre > $elements->count()) {
            throw new InvalidArgumentException("Tirage de {$nombre} éléments parmi {$elements->count()}.");
        }

        return self::melanger($elements)->take($nombre)->values();
    }

    /**
     * @template T
     *
     * @param  Collection<array-key, T>  $elements
     * @return Collection<int, T>
     */
    public static function melanger(Collection $elements): Collection
    {
        $valeurs = $elements->values()->all();
        shuffle($valeurs); // `shuffle()` lit l'état de `mt_srand()`.

        return collect($valeurs);
    }

    /** Une chaîne alphanumérique, comme `Str::random($longueur)`. */
    public static function code(int $longueur): string
    {
        $code = '';
        for ($i = 0; $i < $longueur; $i++) {
            $code .= self::ALPHABET[mt_rand(0, strlen(self::ALPHABET) - 1)];
        }

        return $code;
    }
}
