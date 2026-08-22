<?php

namespace Tests\Feature\Database;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-343 — toute colonne `agency_id` porte un index utilisable.
 *
 * ─── Pourquoi une garde de PROPRIÉTÉ et non un test des trois index créés ──────────
 *
 * Asserter la présence de `payouts_agency_id_created_at_index` serait tautologique : le
 * test relirait ce que la migration vient d'écrire, et il resterait vert le jour où
 * quelqu'un ajoute une VINGT-DEUXIÈME table `agency_id` sans index. Il ne garderait rien.
 *
 * Cette garde interroge le schéma réel et vaut donc pour les tables FUTURES autant que
 * pour celles d'aujourd'hui. C'est le motif que le dépôt emploie déjà ailleurs
 * (`check-models-spec.mjs`, `check-db-engine.mjs`) : *une liste écrite à la main est
 * juste le jour où on l'écrit ; seule une règle dérivée le reste.*
 *
 * ─── Pourquoi `agency_id` en particulier ──────────────────────────────────────────
 *
 * L'agence est la FRONTIÈRE D'ISOLATION du produit (principe non négociable n°2) : une
 * capacité se juge toujours pour un couple *(utilisateur, agence)*, et tout listage est
 * borné par elle. Une colonne `agency_id` nue n'est donc pas une clé étrangère parmi
 * 164 — c'est le prédicat le plus chaud du dépôt.
 *
 * ⚠ Cette garde ne dit rien des 85 AUTRES clés étrangères sans index : celles-là se
 * jugent par la mesure, une par une, et la plupart ne méritent rien (78 pointent vers un
 * parent en soft delete, dont l'`ON DELETE` ne se déclenche jamais). Le détail est dans
 * l'en-tête de `2026_08_22_090000_add_agency_id_indexes_on_scoped_tables.php`.
 */
class AgencyIdIsIndexedTest extends TestCase
{
    use RefreshDatabase;

    public function test_toute_colonne_agency_id_porte_un_index_utilisable(): void
    {
        // `i.indkey[0]` : la PREMIÈRE colonne de l'index. Un composite qui porte
        // `agency_id` en seconde position (p. ex. `(status, agency_id)`) ne sert PAS un
        // filtre sur `agency_id` seul — le compter serait se mentir.
        //
        // `i.indpred IS NULL` : un index PARTIEL ne couvre qu'un sous-ensemble de lignes
        // et ne peut pas servir le cas général.
        $nues = DB::select(<<<'SQL'
            SELECT c.table_name
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.column_name = 'agency_id'
              AND NOT EXISTS (
                  SELECT 1
                  FROM pg_index i
                  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                  WHERE i.indrelid = c.table_name::regclass
                    AND a.attname = 'agency_id'
                    AND i.indpred IS NULL
              )
            ORDER BY c.table_name
        SQL);

        $noms = array_map(static fn (object $r): string => $r->table_name, $nues);

        $this->assertSame([], $noms, sprintf(
            "Ces tables portent `agency_id` sans index utilisable : %s.\n".
            "L'agence est la frontière d'isolation : ces colonnes sont filtrées à chaque listage.\n".
            'Ajouter un index — composite `(agency_id, created_at)` si la table se liste triée par date.',
            implode(', ', $noms)
        ));
    }

    public function test_la_garde_sait_reconnaitre_une_colonne_nue(): void
    {
        // Contrôle d'ABLATION du test lui-même : sans lui, un `assertSame([], …)` resterait
        // vert si la requête ci-dessus ne rendait JAMAIS rien (faute de frappe sur le nom
        // de colonne, schéma erroné, `regclass` qui lève). On fabrique donc une table
        // `agency_id` sans index et on vérifie que la requête la VOIT.
        DB::statement('CREATE TABLE tck343_sonde (id bigint, agency_id bigint)');

        try {
            $nues = DB::select(<<<'SQL'
                SELECT c.table_name
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.column_name = 'agency_id'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM pg_index i
                      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                      WHERE i.indrelid = c.table_name::regclass
                        AND a.attname = 'agency_id'
                        AND i.indpred IS NULL
                  )
            SQL);

            $noms = array_map(static fn (object $r): string => $r->table_name, $nues);

            $this->assertContains('tck343_sonde', $noms, 'La garde ne détecte pas une colonne `agency_id` nue : elle ne garde rien.');
        } finally {
            DB::statement('DROP TABLE IF EXISTS tck343_sonde');
        }
    }
}
