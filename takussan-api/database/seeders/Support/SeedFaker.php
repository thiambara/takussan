<?php

namespace Database\Seeders\Support;

use Faker\Factory;
use Faker\Generator;

/**
 * Le Faker du seed, dont la destruction ne touche pas à la graine (TCK-2380).
 *
 * `Faker\Generator::__destruct()` appelle `mt_srand()` SANS argument : il ré-initialise au hasard
 * l'état que partagent Faker, `mt_rand()` et {@see Tirage}. Une instance ramassée en cours de seed
 * — celle d'un seed précédent dans le même processus, libérée par le ramasse-miettes à un moment
 * qu'on ne choisit pas — effaçait donc la graine au milieu d'un seeder, et le jeu divergeait à
 * partir de là (mesuré : en plein `LeasePaymentSeeder`, sur un second seed de même graine).
 */
final class SeedFaker extends Generator
{
    /** Le Faker de `Faker\Factory::create()`, sur cette classe. */
    public static function create(string $locale): self
    {
        $fabrique = new class extends Factory
        {
            /** @return list<object> les fournisseurs par défaut de la locale, attachés à `$generator` */
            public static function fournisseurs(Generator $generator, string $locale): array
            {
                return array_map(function (string $fournisseur) use ($generator, $locale) {
                    $classe = self::getProviderClassname($fournisseur, $locale);

                    return new $classe($generator);
                }, self::$defaultProviders);
            }
        };

        $faker = new self;
        foreach ($fabrique::fournisseurs($faker, $locale) as $fournisseur) {
            $faker->addProvider($fournisseur);
        }

        return $faker;
    }

    public function __destruct()
    {
        // Rien : la graine appartient au seed, pas à la durée de vie de l'instance.
    }
}
