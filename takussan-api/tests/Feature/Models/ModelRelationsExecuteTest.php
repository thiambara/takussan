<?php

namespace Tests\Feature\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\TestCase;

/**
 * TCK-640 — chaque relation déclarée par un modèle s'exécute contre le schéma réel.
 *
 * `User::bookingPayments()` visait `booking_payments.user_id`, colonne qui n'a jamais existé, et
 * `ModelsTest` la tenait pour juste : il vérifiait le TYPE de la relation (`HasMany`), jamais sa
 * requête. Un type juste sur une clé fausse ne casse qu'à l'exécution — c'est-à-dire chez le premier
 * appelant. Ce test exécute donc chaque relation (`exists()`) sur un modèle à clé fictive, sur
 * PostgreSQL : une colonne, une table ou un pivot faux y rend `42703` / `42P01`.
 *
 * Ce qu'il ne voit pas, dit explicitement :
 * - une relation **sans type de retour** (le test ne la reconnaît que par son type) ;
 * - une relation **à paramètre** ;
 * - `morphTo`, qui ne se résout qu'avec un type porté par la ligne ;
 * - une clé juste en SQL mais fausse en sens (une relation vers la bonne table par la mauvaise
 *   colonne existante) : seul un test de comportement la voit.
 */
class ModelRelationsExecuteTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_typed_relation_executes_against_the_schema(): void
    {
        $failures = [];
        $count = 0;

        foreach ($this->models() as $class) {
            $reflection = new ReflectionClass($class);
            /** @var Model $model */
            $model = new $class;
            $model->setAttribute($model->getKeyName(), 1);
            $model->exists = true;

            foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
                if ($method->class !== $class || $method->isStatic() || $method->getNumberOfRequiredParameters() > 0) {
                    continue;
                }
                $type = $method->getReturnType();
                if (! $type instanceof ReflectionNamedType || $type->isBuiltin()
                    || ! is_a($type->getName(), Relation::class, true) || is_a($type->getName(), MorphTo::class, true)) {
                    continue;
                }

                $count++;
                // Une erreur SQL abandonne la transaction entière (PostgreSQL) : chaque relation
                // s'exécute dans son propre point de sauvegarde, sans quoi la première en échec
                // ferait échouer toutes les suivantes.
                DB::beginTransaction();
                try {
                    $model->{$method->name}()->exists();
                } catch (\Throwable $e) {
                    $failures[] = $class.'::'.$method->name.'() — '.strtok($e->getMessage(), "\n");
                } finally {
                    DB::rollBack();
                }
            }
        }

        // Plancher : un filtre qui ne reconnaîtrait plus aucune relation rendrait ce test vert à vide.
        $this->assertGreaterThan(300, $count, "Seulement {$count} relations reconnues : le filtre ne voit plus les modèles.");
        $this->assertSame([], $failures, implode("\n", $failures));
    }

    /** @return list<class-string<Model>> */
    private function models(): array
    {
        $models = [];
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(app_path('Models')));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $relative = substr($file->getPathname(), strlen(app_path('Models')) + 1, -4);
            $class = 'App\\Models\\'.str_replace('/', '\\', $relative);
            if (! class_exists($class)) {
                continue;
            }
            $reflection = new ReflectionClass($class);
            if ($reflection->isAbstract() || ! $reflection->isSubclassOf(Model::class)) {
                continue;
            }
            $models[] = $class;
        }
        sort($models);

        return $models;
    }
}
