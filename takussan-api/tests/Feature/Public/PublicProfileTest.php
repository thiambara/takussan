<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_agent_profile_returns_contact_card_and_public_portfolio(): void
    {
        $agency = Agency::factory()->create(['name' => 'Takussan Prestige', 'slug' => 'takussan-prestige']);
        $agent = User::factory()->create([
            'username' => 'awa-diop',
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa@example.test',
            'phone' => '+221771234567',
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $publicProperty = Property::factory()->published()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'title' => 'Villa publique',
        ]);
        Property::factory()->draft()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $response = $this->getJson('/api/public/agents/awa-diop');

        $response->assertOk()
            ->assertJsonPath('data.slug', 'awa-diop')
            ->assertJsonPath('data.full_name', 'Awa Diop')
            // TCK-441 — l'adresse de CONNEXION n'est plus publiee ; le telephone, si.
            // La garde de non-regression complete vit dans AgentContactLeadTest.
            ->assertJsonMissingPath('data.email')
            ->assertJsonPath('data.phone', '+221771234567')
            ->assertJsonPath('data.agency.name', 'Takussan Prestige')
            ->assertJsonPath('data.portfolio_count', 1)
            ->assertJsonPath('data.portfolio.0.id', $publicProperty->id);
    }

    public function test_public_agent_profile_returns_404_for_inactive_user(): void
    {
        User::factory()->create([
            'username' => 'inactive-agent',
            'status' => UserStatus::Inactive,
        ]);

        $this->getJson('/api/public/agents/inactive-agent')->assertNotFound();
    }

    public function test_public_agency_profile_returns_active_agents_and_public_portfolio(): void
    {
        $agency = Agency::factory()->create(['name' => 'Sahel Homes', 'slug' => 'sahel-homes']);
        $activeAgent = User::factory()->create([
            'username' => 'moussa-agent',
            'first_name' => 'Moussa',
            'last_name' => 'Ndiaye',
            'status' => UserStatus::Active,
        ]);
        $inactiveAgent = User::factory()->create([
            'username' => 'blocked-agent',
            'status' => UserStatus::Blocked,
        ]);
        AgentProfile::factory()->create(['user_id' => $activeAgent->id, 'agency_id' => $agency->id]);
        AgentProfile::factory()->create(['user_id' => $inactiveAgent->id, 'agency_id' => $agency->id]);
        $publicProperty = Property::factory()->published()->create([
            'user_id' => $activeAgent->id,
            'agency_id' => $agency->id,
            'title' => 'Appartement vitrine',
        ]);
        Property::factory()->published()->create([
            'agency_id' => $agency->id,
            'visibility' => PropertyVisibility::Private,
        ]);

        $response = $this->getJson('/api/public/agencies/sahel-homes');

        $response->assertOk()
            ->assertJsonPath('data.slug', 'sahel-homes')
            ->assertJsonPath('data.name', 'Sahel Homes')
            ->assertJsonPath('data.agents.0.slug', 'moussa-agent')
            ->assertJsonCount(1, 'data.agents')
            ->assertJsonPath('data.portfolio_count', 1)
            ->assertJsonPath('data.portfolio.0.id', $publicProperty->id);
    }

    public function test_public_agency_team_includes_publishers_without_agent_profile(): void
    {
        // TCK-276 — un user qui publie pour l'agence mais qui n'a pas d'AgentProfile
        // (ex. OwnerProfile/landlord publishing through the agency) doit apparaître
        // dans la liste équipe, sinon il y a discontinuité avec la fiche bien.
        $agency = Agency::factory()->create(['slug' => 'cooperative-imm']);
        $agent = User::factory()->create([
            'username' => 'aida-agent',
            'first_name' => 'Aïda',
            'last_name' => 'Sow',
            'status' => UserStatus::Active,
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $publisher = User::factory()->create([
            'username' => 'cheikh-owner',
            'first_name' => 'Cheikh',
            'last_name' => 'Diop',
            'status' => UserStatus::Active,
        ]);
        Property::factory()->published()->create([
            'user_id' => $publisher->id,
            'agency_id' => $agency->id,
            'title' => 'Villa à Saly',
        ]);

        $response = $this->getJson('/api/public/agencies/cooperative-imm');

        $response->assertOk()->assertJsonCount(2, 'data.agents');
        $slugs = collect($response->json('data.agents'))->pluck('slug')->all();
        $this->assertContains('aida-agent', $slugs);
        $this->assertContains('cheikh-owner', $slugs);
        // Publisher with 1 property ranks before agent with 0 (sortByDesc portfolio_count).
        $this->assertSame('cheikh-owner', $slugs[0]);
    }

    public function test_public_agency_profile_returns_404_for_unknown_slug(): void
    {
        $this->getJson('/api/public/agencies/unknown-agency')->assertNotFound();
    }

    public function test_public_agency_profile_exposes_contact_city_stats_and_reviews(): void
    {
        $agency = Agency::factory()->create([
            'slug' => 'baobab-immo',
            'email' => 'contact@baobab.test',
            'phone' => '+221338000000',
        ]);
        Address::factory()->create([
            'addressable_type' => Agency::class,
            'addressable_id' => $agency->id,
            'city' => 'Saint-Louis',
        ]);

        $author = User::factory()->create();

        $agent1 = User::factory()->create(['username' => 'a1', 'status' => UserStatus::Active]);
        $agent2 = User::factory()->create(['username' => 'a2', 'status' => UserStatus::Active]);
        AgentProfile::factory()->create([
            'user_id' => $agent1->id,
            'agency_id' => $agency->id,
            'specialty' => 'Résidentiel',
        ]);
        AgentProfile::factory()->create([
            'user_id' => $agent2->id,
            'agency_id' => $agency->id,
            'specialty' => 'Luxe',
        ]);

        // Agent 1 : 2 biens, dont 1 à Dakar / 1 à Saint-Louis
        $p1 = Property::factory()->published()->create([
            'user_id' => $agent1->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $p1->id,
            'city' => 'Dakar',
        ]);
        $p2 = Property::factory()->published()->create([
            'user_id' => $agent1->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Sale,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $p2->id,
            'city' => 'Saint-Louis',
        ]);

        // Agent 2 : 1 bien
        $p3 = Property::factory()->published()->create([
            'user_id' => $agent2->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $p3->id,
            'city' => 'Dakar',
        ]);

        // Avis : 2 approuvés + 1 pending (à exclure)
        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $agency->id,
            'author_id' => $author->id,
            'rating' => 4,
            'is_approved' => true,
        ]);
        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $agency->id,
            'author_id' => $author->id,
            'rating' => 5,
            'is_approved' => true,
        ]);
        Review::factory()->create([
            'reviewable_type' => Agency::class,
            'reviewable_id' => $agency->id,
            'author_id' => $author->id,
            'rating' => 1,
            'is_approved' => false,
        ]);

        $response = $this->getJson('/api/public/agencies/baobab-immo');

        $response->assertOk()
            ->assertJsonPath('data.email', 'contact@baobab.test')
            ->assertJsonPath('data.phone', '+221338000000')
            ->assertJsonPath('data.city', 'Saint-Louis')
            ->assertJsonPath('data.stats.rent_count', 2)
            ->assertJsonPath('data.stats.sale_count', 1)
            ->assertJsonPath('data.stats.cities', 2)
            ->assertJsonPath('data.stats.agents', 2)
            ->assertJsonPath('data.reviews.count', 2)
            ->assertJsonPath('data.reviews.average', 4.5)
            ->assertJsonCount(2, 'data.reviews.recent');

        // Agents enrichis : specialty + portfolio_count
        $agentsPayload = collect($response->json('data.agents'))->keyBy('slug');
        $this->assertSame('Résidentiel', $agentsPayload['a1']['specialty']);
        $this->assertSame(2, $agentsPayload['a1']['portfolio_count']);
        $this->assertSame('Luxe', $agentsPayload['a2']['specialty']);
        $this->assertSame(1, $agentsPayload['a2']['portfolio_count']);
    }

    public function test_public_agent_profile_exposes_bio_city_specialty_years_and_reviews(): void
    {
        $agency = Agency::factory()->create(['slug' => 'thiossane-immo']);
        $agent = User::factory()->create([
            'username' => 'fatou-sow',
            'bio' => 'Spécialiste des villas neuves à Dakar et Saly.',
            'preferred_language' => 'fr',
            'status' => UserStatus::Active,
        ]);
        Address::factory()->create([
            'addressable_type' => User::class,
            'addressable_id' => $agent->id,
            'city' => 'Mbour',
        ]);
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'specialty' => 'Côtier',
            'hire_date' => now()->subYears(7)->subMonths(2),
        ]);

        $author = User::factory()->create();
        Review::factory()->create([
            'reviewable_type' => User::class,
            'reviewable_id' => $agent->id,
            'author_id' => $author->id,
            'rating' => 5,
            'is_approved' => true,
        ]);
        Review::factory()->create([
            'reviewable_type' => User::class,
            'reviewable_id' => $agent->id,
            'author_id' => $author->id,
            'rating' => 3,
            'is_approved' => false,
        ]);

        $p1 = Property::factory()->published()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $p1->id,
            'city' => 'Saly',
        ]);

        $response = $this->getJson('/api/public/agents/fatou-sow');

        $response->assertOk()
            ->assertJsonPath('data.bio', 'Spécialiste des villas neuves à Dakar et Saly.')
            ->assertJsonPath('data.city', 'Mbour')
            ->assertJsonPath('data.preferred_language', 'fr')
            ->assertJsonPath('data.specialty', 'Côtier')
            ->assertJsonPath('data.years_of_experience', 7)
            ->assertJsonPath('data.stats.rent_count', 1)
            ->assertJsonPath('data.stats.sale_count', 0)
            ->assertJsonPath('data.stats.cities', 1)
            ->assertJsonPath('data.stats.years', 7)
            ->assertJsonPath('data.reviews.count', 1)
            ->assertJsonPath('data.reviews.average', 5)
            ->assertJsonCount(1, 'data.reviews.recent');
    }

    public function test_public_agent_profile_handles_missing_profile_and_addresses(): void
    {
        $agent = User::factory()->create([
            'username' => 'no-profile',
            'status' => UserStatus::Active,
            'bio' => null,
        ]);

        $response = $this->getJson('/api/public/agents/no-profile');

        $response->assertOk()
            ->assertJsonPath('data.bio', null)
            ->assertJsonPath('data.city', null)
            ->assertJsonPath('data.specialty', null)
            ->assertJsonPath('data.years_of_experience', null)
            ->assertJsonPath('data.stats.rent_count', 0)
            ->assertJsonPath('data.stats.sale_count', 0)
            ->assertJsonPath('data.reviews.count', 0)
            ->assertJsonPath('data.reviews.average', null);
    }

    public function test_public_agency_stats_reflect_real_counts_beyond_portfolio_limit(): void
    {
        // TCK-276 — fix bug : les stats agence affichaient le compte de la
        // collection limitée (limit 48) au lieu du vrai COUNT DB. Conséquence :
        // un agent pouvait afficher "50 biens" alors que l'agence en montrait "48".
        $agency = Agency::factory()->create(['slug' => 'mega-agency']);
        $agent = User::factory()->create([
            'username' => 'super-agent',
            'status' => UserStatus::Active,
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        // 50 biens à louer + 5 biens à vendre, tous publics et publiés.
        Property::factory()->published()->count(50)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Property::factory()->published()->count(5)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Sale,
        ]);

        $response = $this->getJson('/api/public/agencies/mega-agency');

        $response->assertOk()
            // Vrais counts DB, pas dérivés de la collection capée à 48.
            ->assertJsonPath('data.stats.rent_count', 50)
            ->assertJsonPath('data.stats.sale_count', 5)
            ->assertJsonPath('data.portfolio_total', 55)
            // Portfolio affiché reste limité à 48 (1ère page).
            ->assertJsonCount(48, 'data.portfolio');

        // Cohérence : portfolio_count par agent ≥ ce qu'on voit dans la page 1.
        $agentsPayload = collect($response->json('data.agents'))->keyBy('slug');
        $this->assertSame(55, $agentsPayload['super-agent']['portfolio_count']);
    }

    public function test_public_agent_stats_reflect_real_counts_beyond_portfolio_limit(): void
    {
        $agency = Agency::factory()->create(['slug' => 'host-agency']);
        $agent = User::factory()->create([
            'username' => 'prolific-agent',
            'status' => UserStatus::Active,
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        Property::factory()->published()->count(40)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
        ]);
        Property::factory()->published()->count(10)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Sale,
        ]);

        $response = $this->getJson('/api/public/agents/prolific-agent');

        $response->assertOk()
            ->assertJsonPath('data.stats.rent_count', 40)
            ->assertJsonPath('data.stats.sale_count', 10)
            ->assertJsonPath('data.portfolio_total', 50)
            ->assertJsonCount(24, 'data.portfolio'); // 1ère page limitée à 24
    }

    public function test_public_agent_properties_endpoint_paginates(): void
    {
        $agency = Agency::factory()->create(['slug' => 'paginated-agency']);
        $agent = User::factory()->create([
            'username' => 'paginated-agent',
            'status' => UserStatus::Active,
        ]);
        Property::factory()->published()->count(30)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        $page1 = $this->getJson('/api/public/agents/paginated-agent/properties?page=1&per_page=24');
        $page1->assertOk()
            ->assertJsonCount(24, 'data')
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 30);

        $page2 = $this->getJson('/api/public/agents/paginated-agent/properties?page=2&per_page=24');
        $page2->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('meta.current_page', 2);
    }

    public function test_public_agency_properties_endpoint_paginates(): void
    {
        $agency = Agency::factory()->create(['slug' => 'paginated-agency-2']);
        $agent = User::factory()->create(['status' => UserStatus::Active]);
        Property::factory()->published()->count(30)->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
        ]);

        $response = $this->getJson('/api/public/agencies/paginated-agency-2/properties?page=2&per_page=24');

        $response->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.total', 30);
    }
}
