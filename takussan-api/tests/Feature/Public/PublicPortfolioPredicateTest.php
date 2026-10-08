<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 (V15) — les portefeuilles des pages agent et agence suivent `publicPortfolio()`, le
 * prédicat de l'index des profils. Six requêtes écrivaient `status=available` + `visibility=public`
 * à la main, sans `is_test` ni `published_at` : un bien de test, ou jamais publié, s'y affichait et
 * menait à une fiche en 404. Rougit sur `e3ab4a4e`.
 *
 * Chaque observable a son compte attendu : un bien éligible, deux qui ne le sont pas. Les
 * trois sont des locations à Dakar, pour que `rent_count` et `cities` voient la différence.
 */
class PublicPortfolioPredicateTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $eligible;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['slug' => 'sahel-homes']);
        $this->agent = User::factory()->create(['username' => 'awa-diop']);
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);

        $this->eligible = $this->bien([], 'Dakar');
        $this->bien(['is_test' => true], 'Thiès');
        $this->bien(['published_at' => null], 'Saint-Louis');
    }

    private function bien(array $attributs, string $ville): Property
    {
        $property = Property::factory()->published()->create($attributs + [
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Address::factory()->create([
            'addressable_id' => $property->id,
            'addressable_type' => Property::class,
            'city' => $ville,
        ]);

        return $property;
    }

    public function test_la_page_agent_ne_montre_que_le_portefeuille_public(): void
    {
        $this->getJson('/api/public/agents/awa-diop')
            ->assertOk()
            ->assertJsonPath('data.portfolio_count', 1)
            ->assertJsonPath('data.portfolio_total', 1)
            ->assertJsonPath('data.portfolio.0.id', $this->eligible->id)
            ->assertJsonPath('data.stats.rent_count', 1)
            ->assertJsonPath('data.stats.cities', 1);

        $this->assertSame(
            [$this->eligible->id],
            array_column($this->getJson('/api/public/agents/awa-diop/properties')->assertOk()->json('data'), 'id'),
        );
    }

    public function test_la_page_agence_ne_montre_que_le_portefeuille_public(): void
    {
        $reponse = $this->getJson('/api/public/agencies/sahel-homes')
            ->assertOk()
            ->assertJsonPath('data.portfolio_count', 1)
            ->assertJsonPath('data.portfolio_total', 1)
            ->assertJsonPath('data.portfolio.0.id', $this->eligible->id)
            ->assertJsonPath('data.stats.rent_count', 1)
            ->assertJsonPath('data.stats.cities', 1);

        $membre = collect($reponse->json('data.agents'))->firstWhere('id', $this->agent->id);
        $this->assertNotNull($membre);
        $this->assertSame(1, $membre['portfolio_count']);

        $this->assertSame(
            [$this->eligible->id],
            array_column($this->getJson('/api/public/agencies/sahel-homes/properties')->assertOk()->json('data'), 'id'),
        );
    }

    /** Les publieurs de l'équipe : qui ne publie QUE des biens inéligibles n'y entre pas. */
    public function test_un_publieur_sans_bien_eligible_n_entre_pas_dans_l_equipe(): void
    {
        $bailleur = User::factory()->create();
        Property::factory()->published()->create([
            'user_id' => $bailleur->id,
            'agency_id' => $this->agency->id,
            'is_test' => true,
        ]);

        $ids = array_column($this->getJson('/api/public/agencies/sahel-homes')->assertOk()->json('data.agents'), 'id');

        $this->assertNotContains($bailleur->id, $ids);
    }
}
