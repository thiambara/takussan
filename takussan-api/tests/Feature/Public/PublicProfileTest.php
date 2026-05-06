<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
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
            ->assertJsonPath('data.email', 'awa@example.test')
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

    public function test_public_agency_profile_returns_404_for_unknown_slug(): void
    {
        $this->getJson('/api/public/agencies/unknown-agency')->assertNotFound();
    }
}
