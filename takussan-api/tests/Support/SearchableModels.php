<?php

namespace Tests\Support;

use Illuminate\Database\Eloquent\Model;
use Laravel\Scout\Searchable;
use ReflectionClass;
use SplFileInfo;
use Symfony\Component\Finder\Finder;

/**
 * La liste des modèles indexés par Scout, DÉRIVÉE du code.
 *
 * `InteractsWithMeilisearch` la maintenait à la main — `[Property, Document]` —
 * et elle avait divergé : `Message` porte `Searchable` depuis longtemps et n'y
 * figurait pas, si bien que ses documents n'étaient JAMAIS purgés entre deux
 * tests (316 tâches mesurées sur une seule exécution de la suite). C'est le
 * motif récurrent de ce dépôt : *aucune liste maintenue à la main ne reste
 * juste ; seule une liste dérivée le reste.*
 */
final class SearchableModels
{
    /**
     * Racine des modèles, résolue par le chemin du fichier et NON par
     * `app_path()` : cette liste est consommée par `Tests\TestCase::setUp()`
     * AVANT `parent::setUp()`, donc avant qu'un conteneur Laravel n'existe.
     */
    private const MODELS_PATH = __DIR__.'/../../app/Models';

    /** @var array<int,class-string<Model>>|null */
    private static ?array $cache = null;

    /**
     * Toute classe concrète de `app/Models` portant le trait Scout.
     *
     * @return array<int,class-string<Model>>
     */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $models = [];

        foreach (Finder::create()->files()->in(self::MODELS_PATH)->name('*.php') as $file) {
            $class = self::classFor($file);

            if ($class === null || ! class_exists($class)) {
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

    /** @return class-string|null */
    private static function classFor(SplFileInfo $file): ?string
    {
        $root = realpath(self::MODELS_PATH);
        $path = $file->getRealPath() ?: $file->getPathname();

        if ($root === false || ! str_starts_with($path, $root)) {
            return null;
        }

        $relative = substr($path, strlen($root) + 1, -strlen('.php'));

        /** @var class-string $class */
        $class = 'App\\Models\\'.str_replace(DIRECTORY_SEPARATOR, '\\', $relative);

        return $class;
    }
}
