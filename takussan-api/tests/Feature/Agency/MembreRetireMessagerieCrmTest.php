<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\RelationshipType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Messaging\MessagingReach;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1713 (P153.06) — la règle 2 de `MessagingReach` (lien CRM) : un rattachement à une fiche
 * D'AGENCE ne compte que pour qui a encore un profil, de tout statut, dans l'agence de la fiche.
 * L'agent retiré, référent d'un client de l'agence, ne le joint plus, ni le client lui ; le
 * bailleur de l'agence joint toujours son locataire, et une fiche sans agence ne change pas.
 */
class MembreRetireMessagerieCrmTest extends TestCase
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
        return app(MessagingReach::class)->query($actor)->pluck('users.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    public function test_le_retire_ne_joint_plus_les_clients_de_l_agence_dont_il_etait_referent(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $client = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $client->id, 'agency_id' => $agency->id]);
        $this->rattacher($agent, $fiche, RelationshipType::AgentClient);

        $bailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
        $this->rattacher($bailleur, $fiche, RelationshipType::OwnerTenant);

        $this->assertContains($client->id, $this->joignables($agent->fresh()), 'avant le retrait');

        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $admin, leaveUnassigned: true);
        $retire = $agent->fresh();

        $this->assertNotContains($client->id, $this->joignables($retire));
        $this->assertNotContains($retire->id, $this->joignables($client->fresh()), 'le client ne joint plus le retiré par la fiche');
        $this->assertContains($client->id, $this->joignables($bailleur->fresh()), 'le bailleur de l agence joint toujours son locataire');

        Sanctum::actingAs($retire);
        $this->postJson('/api/conversations', [
            'participants' => [$client->id],
            'initial_message' => 'Bonjour',
        ])->assertUnprocessable();
    }
}
