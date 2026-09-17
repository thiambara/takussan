<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-528 — `POST /api/payouts` juge `payouts.create` sur le profil actif, et le bailleur doit
 * tenir un profil dans l'agence de l'émetteur.
 *
 * Chaque refus vérifie aussi que **rien n'est écrit**.
 */
class PayoutStoreAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create();
    }

    /** @return array<string,mixed> */
    private function body(?User $landlord = null): array
    {
        return [
            'landlord_id' => ($landlord ?? $this->landlord)->id,
            'gross_amount' => 100000,
        ];
    }

    public function test_an_owner_of_the_agency_is_refused_and_nothing_is_written(): void
    {
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());

        $this->postJson('/api/payouts', $this->body())->assertForbidden();

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_an_agent_whose_custom_role_lacks_the_capability_is_refused(): void
    {
        $role = AgencyRole::factory()
            ->for($this->agency)
            ->withCapabilities([Capability::InvoicesCreate])
            ->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/payouts', $this->body())->assertForbidden();

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_the_capability_is_judged_on_the_active_profile_not_on_another_agency(): void
    {
        // Principe 2 — même cas que côté facture : agent ailleurs, propriétaire ici, profil actif =
        // propriétaire. Vérification adverse : restait vert avec une capacité jugée « n'importe où ».
        $user = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);
        Sanctum::actingAs($user);

        $this->withHeaders(['X-Profile-Id' => "owner:{$owner->id}"])
            ->postJson('/api/payouts', $this->body())
            ->assertForbidden();

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_the_refusal_precedes_validation(): void
    {
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());

        $this->postJson('/api/payouts', [])->assertForbidden();
    }

    public function test_an_agent_creates(): void
    {
        // Décision de la contrainte 3 : l'agent porte `payouts.create`.
        $agent = User::factory()->withAgentProfile($this->agency)->create();
        Sanctum::actingAs($agent);

        $this->postJson('/api/payouts', $this->body())->assertCreated();

        $this->assertDatabaseHas('payouts', [
            'issued_by_id' => $agent->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
        ]);
    }

    public function test_an_agency_admin_creates(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency], 'sanctum');

        $this->postJson('/api/payouts', $this->body())->assertCreated();

        $this->assertDatabaseCount('payouts', 1);
    }

    public function test_a_super_admin_creates(): void
    {
        // Sans agence : `actingAsRole()` en attacherait une, avec un profil owner implicite.
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/payouts', $this->body())->assertCreated();

        $this->assertDatabaseCount('payouts', 1);
    }

    public function test_a_landlord_without_agency_is_refused(): void
    {
        Sanctum::actingAs(User::factory()->withAgentProfile($this->agency)->create());

        $this->postJson('/api/payouts', $this->body(User::factory()->create()))->assertForbidden();

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_a_landlord_of_two_other_agencies_is_refused(): void
    {
        // `$landlord->agency_id` vaut null pour un profil dans deux agences : l'ancienne règle
        // le laissait passer vers n'importe quelle agence.
        $landlord = User::factory()->withOwnerProfile(Agency::factory()->create())->create();
        OwnerProfile::factory()->create([
            'user_id' => $landlord->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        Sanctum::actingAs(User::factory()->withAgentProfile($this->agency)->create());

        $this->postJson('/api/payouts', $this->body($landlord))->assertForbidden();

        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_a_landlord_of_several_agencies_including_the_issuers_is_accepted(): void
    {
        OwnerProfile::factory()->create([
            'user_id' => $this->landlord->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        Sanctum::actingAs(User::factory()->withAgentProfile($this->agency)->create());

        $this->postJson('/api/payouts', $this->body())->assertCreated();
    }
}
