<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class AgencySearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /**
     * TCK-462 — **une recherche d'AGENCES est exposée sans qu'aucune agence n'apparaisse dans le
     * test.** `actingAsRole('super_admin')` — sans clé `agency` — crée une `Agency::factory()`
     * pour porter l'acteur (`tests/TestCase.php`, résolution d'agence, 3ᵉ cas), et
     * `indexSearchable(Agency::class)` l'indexe avec les cibles. Le nom vient de
     * `fake()->company()`, donc d'un tirage — et d'un tirage dont la locale diffère entre la
     * machine (`en_US`) et la CI (`fr_FR`, via le `.env.example` que `api-ci.yml` recopie).
     *
     * Le nom ci-dessous est hors d'atteinte de la tolérance aux fautes pour toutes les requêtes
     * de ce fichier, et il est ÉCRIT : c'est ce qui le distingue d'une chaîne inventée qui se
     * trouve être sûre.
     */
    private const NOM_AGENCE_HORS_ATTEINTE = 'Wxyzptlk Qzvhmbg';

    /**
     * L'agence de l'acteur, nommée. Passer `agency` court-circuite la fabrique implicite.
     */
    private function actingAsSuperAdminHorsAtteinte(): void
    {
        $this->actingAsRole('super_admin', [
            'agency' => Agency::factory()->create(['name' => self::NOM_AGENCE_HORS_ATTEINTE]),
        ]);
    }

    /**
     * TCK-462, site à risque HAUT — reproduit le 2026-08-29 en nommant l'agence de l'acteur
     * `Immobiliere Teranga` : *« Failed asserting that 2 is identical to 1 »*, le message même
     * de la CI du 2026-08-28.
     */
    public function test_agency_search_is_typo_tolerant_for_super_admin(): void
    {
        $this->actingAsSuperAdminHorsAtteinte();

        $cible = Agency::factory()->create(['name' => 'Immobiliere Teranga']);
        $this->indexSearchable(Agency::class);

        $this->getJson('/api/agencies?filter[search]=Terenga')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $cible->id);
    }

    /**
     * AC1 — les trois agences sont créées dans l'ordre INVERSE de leur
     * pertinence : le `defaultSort('-created_at')` du contrôleur rendrait
     * l'ordre opposé.
     *
     * ⚠ TCK-462 — **ce site ne figurait pas au relevé du ticket, et il coche pourtant les trois
     * conditions du critère dérivé.** Reproduit le 2026-08-29 en nommant l'agence de l'acteur
     * `Ndiayefall` : *« Failed asserting that 4 is identical to 3 »*. *Un relevé énumère ; c'est
     * le critère qui désigne.*
     */
    public function test_agency_search_ranks_by_relevance_not_by_date(): void
    {
        $this->actingAsSuperAdminHorsAtteinte();

        $exact = Agency::factory()->create(['name' => 'Ndiayefall', 'created_at' => now()->subDays(3)]);
        $oneTypo = Agency::factory()->create(['name' => 'Ndiayefalt', 'created_at' => now()->subDays(2)]);
        $twoTypos = Agency::factory()->create(['name' => 'Ndiayefaxt', 'created_at' => now()->subDay()]);
        $this->indexSearchable(Agency::class);

        $ids = $this->getJson('/api/agencies?filter[search]=Ndiayefall&fields[agencies]=id,name')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    /**
     * TCK-462 — seul test de ce fichier où la fabrique implicite ne joue pas : `agency` est
     * fourni, donc aucune agence supplémentaire n'est créée, et la première des trois conditions
     * du critère ne tient pas. Seul le second bord manquait — l'assertion d'identité.
     */
    public function test_agency_search_is_bounded_to_visible_agencies(): void
    {
        $agencyA = Agency::factory()->create(['name' => 'Cabinet Searchunique']);
        Agency::factory()->create(['name' => 'Bureau Searchunique']);
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        $this->indexSearchable(Agency::class);

        $response = $this->getJson('/api/agencies?filter[search]=Searchunique')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame([$agencyA->id], $response->json('data.*.id'));
    }

    /**
     * ⚠ TCK-462 — absent du relevé lui aussi, et exposé pour la même raison. Reproduit le
     * 2026-08-29 en nommant l'agence de l'acteur `Agence Fantomatique` : *« Failed asserting
     * that 1 is identical to 0 »*. Un total de 0 est le plus fragile de tous : la panne le
     * satisfait aussi bien que le succès, d'où l'assertion explicite sur `data`.
     */
    public function test_soft_deleted_agency_is_not_searchable(): void
    {
        $this->actingAsSuperAdminHorsAtteinte();

        $agency = Agency::factory()->create(['name' => 'Agence Fantomatique']);
        $agency->delete();
        $this->indexSearchable(Agency::class);

        $this->getJson('/api/agencies?filter[search]=Fantomatique')
            ->assertOk()
            ->assertJsonPath('meta.total', 0)
            ->assertJsonPath('data', []);
    }
}
