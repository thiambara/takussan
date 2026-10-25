<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\RelationshipType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Messaging\MessagingReach;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P223.02 (TCK-2295) — ADR-0031, amendement du 2026-10-25 (D4) : les trois jointures `customers`
 * de la règle 2 de `MessagingReach` (le lien CRM) écartent une fiche supprimée
 * (`customers.deleted_at IS NULL`). Une fiche supprimée n'est plus « une même fiche » : elle ne
 * relie plus deux personnes.
 *
 * Avant : après `DELETE /api/customers/{id}`, le rattachement restait, l'agent et le client se
 * joignaient encore, et `POST /api/conversations` ouvrait un fil entre eux (201). Les fils déjà
 * ouverts restent par la règle 1 (correspondants).
 */
class FicheClientSupprimeeLienCrmTest extends TestCase
{
    use RefreshDatabase;

    private function rattacher(User $user, Customer $fiche, RelationshipType $type): void
    {
        UserCustomerRelationship::create([
            'user_id' => $user->id,
            'customer_id' => $fiche->id,
            'relationship_type' => $type->value,
            'is_primary' => true,
            'status' => 'active',
        ]);
    }

    /** @return list<int> */
    private function joignables(User $actor): array
    {
        return app(MessagingReach::class)->query($actor->fresh())->pluck('users.id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array{agency: Agency, admin: User, agent: User, client: User, fiche: Customer} */
    private function ficheDAgence(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $client = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $client->id, 'agency_id' => $agency->id]);
        $this->rattacher($agent, $fiche, RelationshipType::AgentClient);

        return compact('agency', 'admin', 'agent', 'client', 'fiche');
    }

    public function test_une_fiche_d_agence_supprimee_ne_relie_plus_l_agent_et_le_client(): void
    {
        ['admin' => $admin, 'agent' => $agent, 'client' => $client, 'fiche' => $fiche] = $this->ficheDAgence();
        $this->assertContains($client->id, $this->joignables($agent), 'avant : l agent joint le client');
        $this->assertContains($agent->id, $this->joignables($client), 'avant : le client joint l agent');

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/customers/{$fiche->id}")->assertNoContent();
        $this->assertSame(1, UserCustomerRelationship::query()->where('customer_id', $fiche->id)->count(), 'le rattachement reste');

        $this->assertNotContains($client->id, $this->joignables($agent), 'branche b');
        $this->assertNotContains($agent->id, $this->joignables($client), 'branche c');

        Sanctum::actingAs($agent->fresh());
        $this->postJson('/api/conversations', [
            'participants' => [$client->id],
            'initial_message' => 'Bonjour',
        ])->assertUnprocessable();
    }

    public function test_une_fiche_supprimee_ne_relie_plus_deux_comptes_rattaches(): void
    {
        $proprietaire = User::factory()->create();
        $agent = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => null, 'agency_id' => null]);
        $this->rattacher($proprietaire, $fiche, RelationshipType::OwnerTenant);
        $this->rattacher($agent, $fiche, RelationshipType::AgentClient);
        $this->assertContains($agent->id, $this->joignables($proprietaire), 'avant');

        $fiche->delete();

        $this->assertNotContains($agent->id, $this->joignables($proprietaire), 'branche a');
        $this->assertNotContains($proprietaire->id, $this->joignables($agent), 'branche a, en retour');
    }

    /** Témoin : une fiche vivante relie toujours, et le fil déjà ouvert reste par la règle 1. */
    public function test_temoin_une_fiche_vivante_relie_et_le_fil_ouvert_reste(): void
    {
        ['agency' => $agency, 'admin' => $admin, 'agent' => $agent, 'client' => $client, 'fiche' => $fiche] = $this->ficheDAgence();
        $autreClient = User::factory()->create();
        $vivante = Customer::factory()->create(['user_id' => $autreClient->id, 'agency_id' => $agency->id]);
        $this->rattacher($agent, $vivante, RelationshipType::AgentClient);

        Sanctum::actingAs($agent);
        $this->postJson('/api/conversations', [
            'participants' => [$client->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated();

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/customers/{$fiche->id}")->assertNoContent();

        $this->assertContains($autreClient->id, $this->joignables($agent), 'la fiche vivante relie');
        $this->assertContains($client->id, $this->joignables($agent), 'le correspondant reste joignable');
    }
}
