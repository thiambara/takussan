<?php

namespace Tests\Feature\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\TestCase;

/**
 * TCK-986 (piste P58.01) — aucune relation ne porte le nom d'une colonne de sa table.
 *
 * Deux formes de collision, toutes deux silencieuses :
 *
 * - **nom exact** (`Customer::notes`, colonne et `HasMany`) : `$model->notes` retombe sur la
 *   relation dès que la colonne n'a pas été lue (sparse fieldset), et la charge paresseusement,
 *   une requête par ligne. C'est resté un N+1 invisible jusqu'à P20.01 / TCK-705 ;
 * - **nom `snake_case`** (`BankStatement::uploadedBy` / `uploaded_by`) : `Model::toArray()` fusionne
 *   les attributs PUIS les relations, nommées en `snake_case` — la relation chargée écrase
 *   l'identifiant dans toute sérialisation brute.
 *
 * La règle est dérivée du schéma réel et des types de retour déclarés : elle vaut pour les modèles
 * futurs. Les paires existantes sont listées avec leur raison ; une exception qui ne collisionne plus
 * rougit, pour que la liste ne survive pas à son motif.
 */
class RelationSansCollisionDeColonneTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Collisions existantes au 2026-10-19, `Classe::relation` → raison. Les renommer toucherait les
     * `include=` publics (hors de TCK-986).
     */
    private const EXCEPTIONS = [
        'App\Models\Customer::notes' => 'TCK-705 : CustomerResource ne lit la clé qu\'en colonne lue ou relation chargée',
        'App\Models\AppNotification::deliveryAttempts' => 'aucun chargement dans app/ (grep du 2026-10-19) : la clé ne peut pas être écrasée',
        'App\Models\BankStatement::uploadedBy' => 'BankStatementResource rend la relation sous la clé, par whenLoaded',
        'App\Models\BankStatement::finalizedBy' => 'BankStatementResource rend la relation sous la clé, par whenLoaded',
        'App\Models\BankStatementLine::confirmedBy' => 'aucun chargement dans app/ (grep du 2026-10-19) : la clé ne peut pas être écrasée',
        'App\Models\Lease::earlyTerminationRequestedBy' => 'aucun chargement dans app/ (grep du 2026-10-19) : la clé ne peut pas être écrasée',
        'App\Models\RoleDelegation::revokedBy' => 'RoleDelegationResource lit la relation par whenLoaded',
    ];

    /**
     * @return array{modeles: int, relations: int, collisions: array<string, string>}
     */
    private function balayer(): array
    {
        $dossier = app_path('Models');
        $modeles = 0;
        $relations = 0;
        $collisions = [];

        $iterateur = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier));
        foreach ($iterateur as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = substr($fichier->getPathname(), strlen($dossier) + 1, -4);
            $classe = 'App\\Models\\'.str_replace('/', '\\', $relatif);
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if ($reflexion->isAbstract() || ! $reflexion->isSubclassOf(Model::class)) {
                continue;
            }

            /** @var Model $modele */
            $modele = $reflexion->newInstance();
            $colonnes = Schema::getColumnListing($modele->getTable());
            if ($colonnes === []) {
                continue;
            }
            $modeles++;

            foreach ($reflexion->getMethods(ReflectionMethod::IS_PUBLIC) as $methode) {
                if ($methode->isStatic() || $methode->getNumberOfParameters() > 0) {
                    continue;
                }
                $type = $methode->getReturnType();
                if (! $type instanceof ReflectionNamedType || $type->isBuiltin()
                    || ! is_a($type->getName(), Relation::class, true)) {
                    continue;
                }
                $relations++;

                $nom = $methode->getName();
                foreach (array_unique([$nom, Str::snake($nom)]) as $candidat) {
                    if (in_array($candidat, $colonnes, true)) {
                        $collisions[$classe.'::'.$nom] = $candidat;
                    }
                }
            }
        }

        ksort($collisions);

        return ['modeles' => $modeles, 'relations' => $relations, 'collisions' => $collisions];
    }

    public function test_aucune_relation_ne_porte_le_nom_d_une_colonne_de_sa_table(): void
    {
        $resultat = $this->balayer();

        // Plancher de plausibilité : ~70 modèles et plusieurs centaines de relations le 2026-10-19.
        // Un dossier déplacé ou des types de retour perdus rendraient « 0 collision » sans rien voir.
        $this->assertGreaterThan(50, $resultat['modeles'], 'le balayage ne voit presque aucun modèle');
        $this->assertGreaterThan(150, $resultat['relations'], 'le balayage ne voit presque aucune relation typée');

        $neuves = array_diff_key($resultat['collisions'], self::EXCEPTIONS);
        $this->assertSame(
            [],
            $neuves,
            "relation au nom (ou au nom snake_case) d'une colonne de sa table — renommer la relation :\n"
                .implode("\n", array_map(fn ($k, $v) => "$k ↔ colonne $v", array_keys($neuves), $neuves)),
        );

        $perimees = array_diff_key(self::EXCEPTIONS, $resultat['collisions']);
        $this->assertSame([], $perimees, 'exception qui ne collisionne plus : la retirer de la liste');
    }
}
