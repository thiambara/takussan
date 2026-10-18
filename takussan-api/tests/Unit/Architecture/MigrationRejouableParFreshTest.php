<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;

/**
 * TCK-881 — `migrate:fresh` supprime les tables, jamais les fonctions : sur PostgreSQL,
 * `dropAllTables()` laisse `credit_movements_append_only()` en place, et la migration qui la créait
 * par `CREATE FUNCTION` mourait en `42723` (« la fonction existe déjà »). Toute remise à zéro d'une
 * base déjà migrée échouait : le seed de la préproduction (`docker/seed.sh`) et `smoke-api.sh pile`,
 * du 2026-10-12 au 2026-10-18.
 *
 * Une fonction ou une procédure se crée donc par `CREATE OR REPLACE` : rejouée sur une base où elle
 * survit, la migration la remplace au lieu d'échouer.
 */
class MigrationRejouableParFreshTest extends TestCase
{
    public function test_une_fonction_se_cree_par_create_or_replace(): void
    {
        $racine = dirname(__DIR__, 3).'/database/migrations';
        $fichiers = glob($racine.'/*.php') ?: [];
        $this->assertGreaterThan(100, count($fichiers), "Les migrations ne sont plus sous {$racine} : ce test ne garde plus rien.");

        $fautes = [];
        foreach ($fichiers as $fichier) {
            $source = (string) file_get_contents($fichier);
            if (preg_match_all('/\bCREATE\s+(FUNCTION|PROCEDURE)\b/i', $source, $m) > 0) {
                $fautes[] = basename($fichier).' : CREATE '.implode(', CREATE ', $m[1]);
            }
        }

        $this->assertSame([], $fautes, 'migrate:fresh ne supprime pas les fonctions : les créer par CREATE OR REPLACE.');
    }
}
