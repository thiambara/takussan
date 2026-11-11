<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Invitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/** TCK-2665 — `GET /api/invitations?filter[customer_id]=…` : les invitations nées d'une fiche client. */
class InvitationsCustomerFilterTest extends ApiTestCase
{
    use RefreshDatabase;

    private function fromCustomer(Customer $customer): Invitation
    {
        return Invitation::factory()->create([
            'agency_id' => $customer->agency_id, 'role' => 'tenant',
            'invitable_type' => Customer::class, 'invitable_id' => $customer->id,
        ]);
    }

    public function test_ac6_le_filtre_rend_la_seule_invitation_nee_de_la_fiche(): void
    {
        $agency = Agency::factory()->create();
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        $other = Customer::factory()->create(['agency_id' => $agency->id]);
        $mine = $this->fromCustomer($customer);
        $this->fromCustomer($other);
        // Une invitation d'un autre type dont l'identifiant de cible coïncide n'est pas née de la fiche.
        Invitation::factory()->create(['agency_id' => $agency->id, 'role' => 'agent', 'invitable_type' => 'App\\Models\\Profiles\\AgentProfile', 'invitable_id' => $customer->id]);
        Invitation::factory()->create(['agency_id' => $agency->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$mine->id], array_column($this->apiGet("/api/invitations?filter[customer_id]={$customer->id}")->assertOk()->json('data'), 'id'));
        $this->apiGet('/api/invitations')->assertOk()->assertJsonPath('meta.total', 4);
    }

    public function test_plusieurs_fiches_et_valeur_illisible(): void
    {
        $agency = Agency::factory()->create();
        $a = $this->fromCustomer(Customer::factory()->create(['agency_id' => $agency->id]));
        $b = $this->fromCustomer(Customer::factory()->create(['agency_id' => $agency->id]));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $ids = array_column($this->apiGet("/api/invitations?filter[customer_id]={$a->invitable_id},{$b->invitable_id}")->assertOk()->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $ids);
        $this->apiGet('/api/invitations?filter[customer_id]=abc')->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_la_fiche_d_une_autre_agence_ne_rend_rien(): void
    {
        $agency = Agency::factory()->create();
        $elsewhere = $this->fromCustomer(Customer::factory()->create(['agency_id' => Agency::factory()->create()->id]));
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet("/api/invitations?filter[customer_id]={$elsewhere->invitable_id}")->assertOk()->assertJsonPath('meta.total', 0);
    }
}
