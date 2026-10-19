<?php

namespace Tests\Feature\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionProperty;
use Tests\TestCase;

/**
 * TCK-987 (piste P58.02) — une relation `BelongsTo` chargeable par `include=` a sa clé étrangère
 * dans `$queryFields`.
 *
 * Sans elle, un `fields[<table>]=…` ne peut pas sélectionner la clé (spatie refuse un champ hors
 * liste), et la relation se charge à vide : `include=uploadedBy&fields[bank_statements]=id,status`
 * rendait `uploaded_by: null` pour un relevé qui a un auteur, sans erreur.
 *
 * La règle vaut pour tout modèle qui déclare à la fois `$queryFields` et `$requestLoadable` : un
 * modèle sans `$queryFields` n'a pas de sparse fieldset, il rend toutes ses colonnes.
 */
class RelationChargeableACleSelectionnableTest extends TestCase
{
    /**
     * @return array{modeles: int, relations: int, fautes: list<string>}
     */
    private function balayer(): array
    {
        $dossier = app_path('Models');
        $modeles = 0;
        $relations = 0;
        $fautes = [];

        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier));
        foreach ($iterateur as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $classe = 'App\\Models\\'.str_replace('/', '\\', substr($fichier->getPathname(), strlen($dossier) + 1, -4));
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if ($reflexion->isAbstract() || ! $reflexion->isSubclassOf(Model::class)
                || ! $reflexion->hasProperty('queryFields') || ! $reflexion->hasProperty('requestLoadable')) {
                continue;
            }

            $champs = $this->statique($reflexion->getProperty('queryFields'));
            $chargeables = $this->statique($reflexion->getProperty('requestLoadable'));
            if ($champs === [] || $chargeables === []) {
                continue;
            }
            $modeles++;

            /** @var Model $modele */
            $modele = $reflexion->newInstance();
            foreach ($chargeables as $nom) {
                if (! method_exists($modele, $nom)) {
                    continue;
                }
                $relation = $modele->{$nom}();
                if (! $relation instanceof BelongsTo) {
                    continue;
                }
                $relations++;

                $cles = [$relation->getForeignKeyName()];
                if ($relation instanceof MorphTo) {
                    $cles[] = $relation->getMorphType();
                }
                foreach ($cles as $cle) {
                    if (! in_array($cle, $champs, true)) {
                        $fautes[] = "{$classe}::{$nom} — `{$cle}` absent de \$queryFields";
                    }
                }
            }
        }

        sort($fautes);

        return ['modeles' => $modeles, 'relations' => $relations, 'fautes' => $fautes];
    }

    /** @return array<int, string> */
    private function statique(ReflectionProperty $propriete): array
    {
        if (! $propriete->isStatic()) {
            return [];
        }

        return (array) $propriete->getValue();
    }

    public function test_toute_belongs_to_chargeable_a_sa_cle_dans_les_champs_selectionnables(): void
    {
        $resultat = $this->balayer();

        // Plancher de plausibilité : une trentaine de modèles déclarent les deux listes le 2026-10-19.
        $this->assertGreaterThan(15, $resultat['modeles'], 'le balayage ne voit presque aucun modèle');
        $this->assertGreaterThan(20, $resultat['relations'], 'le balayage ne voit presque aucune BelongsTo chargeable');

        $this->assertSame(
            [],
            $resultat['fautes'],
            "relation chargeable dont la clé ne peut pas être sélectionnée sous fields[] — elle sortirait null :\n"
                .implode("\n", $resultat['fautes']),
        );
    }
}
