<?php

namespace App\Support\Search;

use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;
use ReflectionClass;
use Symfony\Component\Finder\Finder;

/**
 * Les modèles indexés par Scout, DÉRIVÉS du code : toute classe concrète de
 * `app/Models` qui porte le trait `Searchable`.
 *
 * `YearOfActivitySeeder` réindexait une liste écrite à la main, restée à
 * `Property`, `Document`, `Message` quand TCK-281 a rendu `Customer`,
 * `MaintenanceRequest`, `User` et `Agency` indexables : après un seed, leurs
 * index restaient vides (TCK-701). *Aucune liste maintenue à la main ne reste
 * juste ; seule une liste dérivée le reste.*
 *
 * `Tests\Support\SearchableModels` garde sa propre dérivation, lue avant que
 * l'application ne démarre : c'est elle qui sert d'oracle au test du seeder.
 */
final class SearchableModels
{
    /** @var array<int,class-string<Model>>|null */
    private static ?array $cache = null;

    /** @return array<int,class-string<Model>> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $root = realpath(__DIR__.'/../../Models');
        $models = [];

        foreach (Finder::create()->files()->in($root)->name('*.php') as $file) {
            $relative = substr($file->getRealPath(), strlen($root) + 1, -strlen('.php'));
            $class = 'App\\Models\\'.str_replace(DIRECTORY_SEPARATOR, '\\', $relative);

            if (! class_exists($class)) {
                continue;
            }

            $reflection = new ReflectionClass($class);

            if ($reflection->isAbstract() || ! $reflection->isSubclassOf(Model::class)) {
                continue;
            }

            if (in_array(Searchable::class, class_uses_recursive($class), true)) {
                $models[] = $class;
            }
        }

        sort($models);

        return self::$cache = $models;
    }
}
