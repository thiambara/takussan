<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-1117 (P96.01) — un compte supprimé en douceur ne devient pas collaborateur d'un bien.
 *
 * `exists:users,id` ne voit pas `deleted_at`, et `CollaboratorEligibleForProperty` cherche le
 * compte par `find()`, que la portée `SoftDeletes` masque : introuvable, la règle rendait sans
 * échec, en comptant sur `exists:` pour refuser. Le bailleur obtenait 201, une ligne
 * `property_collaborators` à `"user": null`, et une part de commission comptée par le plafond.
 */
class CollaboratorDeletedAccountTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $bailleur;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
        $this->bien = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agency->id]);
    }

    private function ajouter(int $userId, CollaboratorRole $role): TestResponse
    {
        return $this->actingAsApi($this->bailleur)->apiPost("/api/properties/{$this->bien->id}/collaborators", [
            'user_id' => $userId,
            'role' => $role->value,
            'commission_share' => 10,
        ]);
    }

    private function agentDeLAgence(): User
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agency);

        return $agent;
    }

    public function test_un_agent_supprime_n_est_pas_ajoute_comme_collaborateur(): void
    {
        $agent = $this->agentDeLAgence();
        $agent->delete();

        foreach ([CollaboratorRole::Agent, CollaboratorRole::Viewer] as $role) {
            $this->ajouter($agent->id, $role)
                ->assertStatus(422)
                ->assertJsonValidationErrors(['user_id']);
        }

        $this->assertDatabaseMissing('property_collaborators', ['property_id' => $this->bien->id]);
    }

    public function test_un_identifiant_absent_et_un_compte_supprime_rendent_la_meme_erreur(): void
    {
        $agent = $this->agentDeLAgence();
        $agent->delete();

        $supprime = $this->ajouter($agent->id, CollaboratorRole::Agent)->assertStatus(422)->json('errors.user_id');
        $absent = $this->ajouter(999_999_999, CollaboratorRole::Agent)->assertStatus(422)->json('errors.user_id');

        $this->assertSame($absent, $supprime);
    }

    /** Témoin : le même agent, non supprimé, s'ajoute. */
    public function test_un_agent_actif_reste_ajoutable(): void
    {
        $this->ajouter($this->agentDeLAgence()->id, CollaboratorRole::Agent)->assertCreated();
    }
}
