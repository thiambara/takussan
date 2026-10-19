<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Meilisearch\Client;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\TestSearchIndex;
use Tests\TestCase;

/**
 * TCK-995 (P52.02, P52.03) — `search:verify-indexes` : un index vide face à une table non vide,
 * et une tâche échouée depuis un horodatage, font sortir la commande en échec.
 */
class SearchVerifyIndexesTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private function client(): Client
    {
        return new Client(config('scout.meilisearch.host'), config('scout.meilisearch.key'));
    }

    public function test_un_index_vide_face_a_une_table_non_vide_fait_echouer_la_verification(): void
    {
        Agency::withoutSyncingToSearch(fn () => Agency::factory()->create());

        $this->assertSame(1, Artisan::call('search:verify-indexes', ['--documents' => true]));
        $this->assertStringContainsString((new Agency)->indexableAs(), Artisan::output());
    }

    public function test_un_index_peuple_passe_la_verification(): void
    {
        Agency::withoutSyncingToSearch(fn () => Agency::factory()->create());
        $this->indexSearchable(Agency::class);

        $this->assertSame(0, Artisan::call('search:verify-indexes', ['--documents' => true]), Artisan::output());
    }

    public function test_des_tables_vides_passent_la_verification(): void
    {
        $this->assertSame(0, Artisan::call('search:verify-indexes', ['--documents' => true]), Artisan::output());
    }

    public function test_une_tache_echouee_depuis_l_horodatage_fait_echouer_la_verification(): void
    {
        $nom = 'essai_taches';
        config(['scout.meilisearch.index-settings' => [$nom => []]]);
        $depuis = gmdate('Y-m-d\TH:i:s\Z', time() - 1);

        // Aucun champ ne peut servir de clé primaire : la tâche est acceptée, puis échoue.
        $this->client()->index(TestSearchIndex::prefix().$nom)->addDocuments([['nom' => 'sans identifiant']]);

        $this->assertSame(1, Artisan::call('search:verify-indexes', ['--depuis' => $depuis]));
        $this->assertStringContainsString(TestSearchIndex::prefix().$nom, Artisan::output());

        $apres = gmdate('Y-m-d\TH:i:s\Z', time() + 1);
        $this->assertSame(0, Artisan::call('search:verify-indexes', ['--depuis' => $apres]), Artisan::output());
    }

    public function test_sans_option_la_commande_refuse(): void
    {
        $this->assertSame(1, Artisan::call('search:verify-indexes'));
    }
}
