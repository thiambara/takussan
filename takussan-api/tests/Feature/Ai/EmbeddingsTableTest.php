<?php

namespace Tests\Feature\Ai;

use App\Services\Ai\EmbeddingsTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2423 (AC6) — la table `embeddings` est facultative. Un `CREATE EXTENSION` refusé abandonnerait la transaction entière
 * s'il n'était pas contenu : ces tests tournent DANS la transaction de `RefreshDatabase`, et la relisent après le refus.
 */
class EmbeddingsTableTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_10_31_242300_create_embeddings_table.php';

    /** Le rôle de la préproduction : ni superutilisateur, ni droit de créer dans la base. */
    private function sansDroit(): void
    {
        Schema::dropIfExists('embeddings');
        DB::statement('DROP EXTENSION IF EXISTS vector CASCADE');
        DB::statement('CREATE ROLE radar_sans_droit NOSUPERUSER NOCREATEDB');
        DB::statement('REVOKE CREATE ON DATABASE '.DB::getDatabaseName().' FROM PUBLIC');
        DB::statement('SET LOCAL ROLE radar_sans_droit');
    }

    public function test_la_migration_cree_la_table_quand_lextension_est_permise(): void
    {
        $this->assertTrue(Schema::hasTable('embeddings'));
        $this->assertSame(
            ['id', 'embeddable_type', 'embeddable_id', 'provider', 'model', 'dimension', 'vector', 'content_hash', 'created_at', 'updated_at'],
            Schema::getColumnListing('embeddings'),
        );
        $this->assertSame('vector', Schema::getColumnType('embeddings', 'vector'));
    }

    public function test_un_refus_de_droit_ne_fait_pas_rougir_et_nabandonne_pas_la_transaction(): void
    {
        $this->sansDroit();

        $this->assertSame(EmbeddingsTable::REFUSED, app(EmbeddingsTable::class)->install());

        // La transaction vit : une erreur SQL non contenue lèverait ici « current transaction is aborted ».
        $this->assertSame(1, (int) DB::selectOne('select 1 as un')->un);
        DB::statement('RESET ROLE');
        $this->assertFalse(Schema::hasTable('embeddings'));
    }

    public function test_une_extension_indisponible_ne_cree_rien_et_nessaie_rien(): void
    {
        Schema::dropIfExists('embeddings');
        DB::statement('DROP EXTENSION IF EXISTS vector CASCADE');
        $table = new class extends EmbeddingsTable
        {
            protected function extensionAvailable(): bool
            {
                return false;
            }
        };
        DB::enableQueryLog();

        $this->assertSame(EmbeddingsTable::UNAVAILABLE, $table->install());

        $this->assertSame([], array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => str_contains($sql, 'CREATE')));
        $this->assertFalse(Schema::hasTable('embeddings'));
    }

    public function test_up_tient_le_refus_et_tourne_hors_transaction(): void
    {
        $migration = require base_path(self::MIGRATION);
        $this->assertFalse($migration->withinTransaction);
        $this->sansDroit();

        $migration->up();

        DB::statement('RESET ROLE');
        $this->assertFalse(Schema::hasTable('embeddings'));
    }

    public function test_down_retire_la_table_et_lextension_et_up_les_rend(): void
    {
        $migration = require base_path(self::MIGRATION);

        $migration->down();
        $this->assertFalse(Schema::hasTable('embeddings'));
        $this->assertFalse(DB::table('pg_extension')->where('extname', 'vector')->exists());

        $migration->up();
        $this->assertTrue(Schema::hasTable('embeddings'));
        $this->assertTrue(DB::table('pg_extension')->where('extname', 'vector')->exists());
    }

    public function test_down_laisse_une_extension_qui_nest_pas_au_role(): void
    {
        Schema::dropIfExists('embeddings');
        DB::statement('CREATE ROLE radar_sans_droit NOSUPERUSER NOCREATEDB');
        DB::statement('SET LOCAL ROLE radar_sans_droit');

        (require base_path(self::MIGRATION))->down();

        $this->assertSame(1, (int) DB::selectOne('select 1 as un')->un);
        DB::statement('RESET ROLE');
        $this->assertTrue(DB::table('pg_extension')->where('extname', 'vector')->exists());
    }

    public function test_down_laisse_une_extension_dont_un_autre_objet_depend(): void
    {
        Schema::dropIfExists('embeddings');
        DB::statement('CREATE TABLE autre_usage (v vector)');

        (require base_path(self::MIGRATION))->down();

        $this->assertSame(1, (int) DB::selectOne('select 1 as un')->un);
        $this->assertTrue(DB::table('pg_extension')->where('extname', 'vector')->exists());
    }

    public function test_la_commande_cree_la_table_une_fois_lextension_posee_et_dit_son_echec(): void
    {
        Schema::dropIfExists('embeddings');

        $this->artisan('ai:install-embeddings')->assertSuccessful();
        $this->assertTrue(Schema::hasTable('embeddings'));
        $this->artisan('ai:install-embeddings')->assertSuccessful();

        $this->sansDroit();
        $this->artisan('ai:install-embeddings')->assertFailed();
    }
}
