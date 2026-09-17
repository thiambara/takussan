<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-528 — `POST /api/invoices` juge `invoices.create` sur le profil actif.
 *
 * Chaque refus vérifie aussi que **rien n'est écrit** : un 403 rendu après l'insertion serait vert
 * sur le code de réponse et faux sur l'effet.
 *
 * Tous les appelants refusés ici sont membres de l'agence du client : c'est la règle
 * d'appartenance de `InvoiceService::create()` qui les laissait passer avant.
 */
class InvoiceStoreAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->customer = Customer::factory()->create(['agency_id' => $this->agency->id]);
    }

    /** @return array<string,mixed> */
    private function body(): array
    {
        return [
            'customer_id' => $this->customer->id,
            'issue_date' => now()->toDateString(),
            'subtotal' => 100000,
        ];
    }

    public function test_an_owner_of_the_customers_agency_is_refused_and_nothing_is_written(): void
    {
        // `owner` ne porte pas `invoices.create` (SystemRoleCapabilities).
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());

        $this->postJson('/api/invoices', $this->body())->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_an_agent_whose_custom_role_lacks_the_capability_is_refused(): void
    {
        // Même TYPE de profil que l'agent qui crée plus bas : c'est la capacité du rôle qui
        // tranche, pas le type.
        $role = AgencyRole::factory()
            ->for($this->agency)
            ->withCapabilities([Capability::InvoicesSend])
            ->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/invoices', $this->body())->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_a_customer_of_another_agency_is_refused_even_when_the_issuer_added_it(): void
    {
        // Vérification adverse : rendait 201, facture rattachée à l'agence de l'émetteur.
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $this->customer->update(['added_by_id' => $agent->id]);
        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', $this->body())->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_a_customer_without_agency_added_by_the_issuer_is_still_invoiceable(): void
    {
        $agent = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $this->customer->update(['agency_id' => null, 'added_by_id' => $agent->id]);
        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', $this->body())->assertCreated();
    }

    public function test_a_role_holding_only_payouts_create_is_refused(): void
    {
        // Vérification adverse : sans ce cas, un `authorize()` qui lirait `payouts.create` restait
        // vert — aucun autre appelant de cette classe ne porte l'une sans l'autre.
        $role = AgencyRole::factory()
            ->for($this->agency)
            ->withCapabilities([Capability::PayoutsCreate])
            ->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/invoices', $this->body())->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_the_capability_is_judged_on_the_active_profile_not_on_another_agency(): void
    {
        // Principe 2 : agent (avec la capacité) dans une agence A, propriétaire (sans) dans
        // l'agence du client. Profil actif = le propriétaire. Une capacité jugée « dans l'une
        // quelconque de ses agences » laisserait passer — vérification adverse, restée verte avant.
        $user = User::factory()->withAgentProfile(Agency::factory()->create())->create();
        $owner = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);
        Sanctum::actingAs($user);

        $this->withHeaders(['X-Profile-Id' => "owner:{$owner->id}"])
            ->postJson('/api/invoices', $this->body())
            ->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }

    public function test_the_same_user_creates_once_the_agent_profile_is_active(): void
    {
        // Contre-épreuve du cas précédent : le refus tient au profil actif, pas au user.
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $this->agency->id,
        ]);
        OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        Sanctum::actingAs($user);

        $this->withHeaders(['X-Profile-Id' => "agent:{$agent->id}"])
            ->postJson('/api/invoices', $this->body())
            ->assertCreated();

        $this->assertDatabaseHas('invoices', ['issued_by_id' => $user->id, 'agency_id' => $this->agency->id]);
    }

    public function test_the_refusal_precedes_validation(): void
    {
        Sanctum::actingAs(User::factory()->withOwnerProfile($this->agency)->create());

        // Corps vide : sans l'autorisation dans le FormRequest, 422 et le détail des règles.
        $this->postJson('/api/invoices', [])->assertForbidden();
    }

    public function test_an_agent_creates(): void
    {
        $agent = User::factory()->withAgentProfile($this->agency)->create();
        Sanctum::actingAs($agent);

        $this->postJson('/api/invoices', $this->body())
            ->assertCreated()
            ->assertJsonPath('data.issued_by_id', $agent->id);

        $this->assertDatabaseHas('invoices', [
            'issued_by_id' => $agent->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    public function test_an_agency_admin_creates(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency], 'sanctum');

        $this->postJson('/api/invoices', $this->body())->assertCreated();

        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_a_super_admin_creates(): void
    {
        // Sans agence : `actingAsRole()` en attacherait une, avec un profil owner implicite.
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/invoices', $this->body())->assertCreated();

        $this->assertDatabaseCount('invoices', 1);
    }

    public function test_the_capability_does_not_lift_the_membership_rule(): void
    {
        // Contrainte 4 : un agent d'une AUTRE agence porte la capacité, mais pas le client.
        Sanctum::actingAs(User::factory()->withAgentProfile(Agency::factory()->create())->create());

        $this->postJson('/api/invoices', $this->body())->assertForbidden();

        $this->assertDatabaseCount('invoices', 0);
    }
}
