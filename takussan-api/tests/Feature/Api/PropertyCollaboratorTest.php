<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyCollaboratorTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-586 — un collaborateur appartient à l'agence du bien. Les cas historiques ajoutaient un
     * `User::factory()` nu, c'est-à-dire n'importe quel compte : c'est le défaut que la règle
     * d'éligibilité ferme. Ils ajoutent désormais un agent de l'agence du bien.
     *
     * @return array{0: User, 1: Property} le bailleur auteur du bien, et le bien de son agence
     */
    private function bienDUnBailleur(): array
    {
        $agence = Agency::factory()->create();
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);

        return [$bailleur, Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id])];
    }

    private function agentDe(int $agencyId): User
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agencyId]);

        return $agent;
    }

    public function test_owner_can_add_collaborator(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();
        $collaborator = $this->agentDe($property->agency_id);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 10,
        ])->assertCreated()
            ->assertJsonPath('data.role', CollaboratorRole::Agent->value)
            ->assertJsonPath('data.commission_share', '10.00');

        $this->assertDatabaseCount('property_collaborators', 1);
    }

    public function test_cannot_add_duplicate_collaborator(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();
        $collaborator = $this->agentDe($property->agency_id);

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $collaborator->id,
            'role' => CollaboratorRole::Agent->value,
        ])->assertStatus(422);
    }

    public function test_owner_can_list_collaborators(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Manager->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson("/api/properties/{$property->id}/collaborators")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_owner_can_update_collaborator_role(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'role' => CollaboratorRole::Manager->value,
        ])->assertOk()
            ->assertJsonPath('data.role', CollaboratorRole::Manager->value);
    }

    public function test_owner_can_remove_collaborator(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}/collaborators/{$collab->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('property_collaborators', ['id' => $collab->id]);
    }

    public function test_random_user_cannot_access_collaborators(): void
    {
        $property = Property::factory()->create();

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$property->id}/collaborators")
            ->assertForbidden();
    }

    public function test_store_rejects_when_total_commission_exceeds_100(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 60,
            'invited_at' => now(),
        ]);

        $new = $this->agentDe($property->agency_id);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $new->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 50,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['commission_share']);
    }

    public function test_store_allows_boundary_total_commission_of_exactly_100(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 60,
            'invited_at' => now(),
        ]);

        $new = $this->agentDe($property->agency_id);

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $new->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 40,
        ])->assertCreated();
    }

    public function test_update_rejects_when_total_commission_exceeds_100(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 60,
            'invited_at' => now(),
        ]);

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 30,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'commission_share' => 50,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['commission_share']);
    }

    public function test_update_allows_boundary_total_commission_of_exactly_100(): void
    {
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 60,
            'invited_at' => now(),
        ]);

        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 30,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'commission_share' => 40,
        ])->assertOk();
    }

    public function test_store_commission_cap_runs_inside_transaction(): void
    {
        // Deterministic guarantee that the cap check + insert happen inside a
        // DB transaction — combined with lockForUpdate on the sum, this closes
        // the TOCTOU race between concurrent writers. SQLite does not emit a
        // literal "FOR UPDATE" clause (the grammar strips it), so we instead
        // assert the transaction nesting level at the moment the collaborator
        // row is being created.
        [$owner, $property] = $this->bienDUnBailleur();

        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $this->agentDe($property->agency_id)->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 50,
            'invited_at' => now(),
        ]);

        $new = $this->agentDe($property->agency_id);
        $observedLevel = null;

        PropertyCollaborator::creating(function () use (&$observedLevel) {
            $observedLevel = DB::transactionLevel();
        });

        Sanctum::actingAs($owner);

        $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $new->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 30,
        ])->assertCreated();

        PropertyCollaborator::flushEventListeners();

        $this->assertNotNull($observedLevel, 'creating hook did not fire');
        $this->assertGreaterThanOrEqual(1, $observedLevel, 'Expected collaborator insert to run inside a DB transaction.');
    }

    // ── TCK-586, §5 — éligibilité des collaborateurs (AC8) ─────────────────────────────────────

    private function ajouter(Property $property, User $user, CollaboratorRole $role): TestResponse
    {
        return $this->postJson("/api/properties/{$property->id}/collaborators", [
            'user_id' => $user->id,
            'role' => $role->value,
        ]);
    }

    public function test_store_refuse_un_utilisateur_sans_profil_dans_l_agence_du_bien(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $tiers = User::factory()->create();

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $tiers, CollaboratorRole::Agent)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
        $this->assertDatabaseCount('property_collaborators', 0);
    }

    /** Attrape une règle qui ne vérifierait que « a un profil d'agent », quelque part. */
    public function test_store_refuse_un_agent_d_une_autre_agence(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $agentAilleurs = $this->agentDe(Agency::factory()->create()->id);

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $agentAilleurs, CollaboratorRole::Agent)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
        $this->assertDatabaseCount('property_collaborators', 0);
    }

    public function test_store_refuse_un_bailleur_de_l_agence_en_role_agent(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $autreBailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autreBailleur->id, 'agency_id' => $property->agency_id]);

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $autreBailleur, CollaboratorRole::Agent)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
        $this->ajouter($property, $autreBailleur, CollaboratorRole::Manager)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
        $this->assertDatabaseCount('property_collaborators', 0);
    }

    /** Attrape une règle trop stricte : l'admin d'agence est du personnel, comme l'agent. */
    public function test_store_accepte_un_agent_et_un_admin_de_l_agence(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $agent = $this->agentDe($property->agency_id);
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $property->agency_id]);

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $agent, CollaboratorRole::Agent)->assertCreated();
        $this->ajouter($property, $admin, CollaboratorRole::Agent)->assertCreated();
        $this->assertDatabaseCount('property_collaborators', 2);
    }

    public function test_store_accepte_un_bailleur_de_l_agence_en_co_owner(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $autreBailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autreBailleur->id, 'agency_id' => $property->agency_id]);

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $autreBailleur, CollaboratorRole::CoOwner)
            ->assertCreated()
            ->assertJsonPath('data.role', CollaboratorRole::CoOwner->value);
    }

    public function test_store_refuse_tout_collaborateur_sur_un_bien_sans_agence(): void
    {
        $bailleur = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => null]);
        $agent = $this->agentDe(Agency::factory()->create()->id);

        Sanctum::actingAs($bailleur);

        $this->ajouter($property, $agent, CollaboratorRole::Viewer)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_update_refuse_de_passer_un_bailleur_en_role_agent(): void
    {
        [$bailleur, $property] = $this->bienDUnBailleur();
        $autreBailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $autreBailleur->id, 'agency_id' => $property->agency_id]);
        $collab = PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $autreBailleur->id,
            'role' => CollaboratorRole::CoOwner->value,
            'invited_at' => now(),
        ]);

        Sanctum::actingAs($bailleur);

        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'role' => CollaboratorRole::Agent->value,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['role']);

        $this->assertSame(CollaboratorRole::CoOwner, $collab->fresh()->role);

        // La part de commission seule ne rejuge pas le rôle : le PUT reste ouvert.
        $this->putJson("/api/properties/{$property->id}/collaborators/{$collab->id}", [
            'commission_share' => 5,
        ])->assertOk();
    }

    /**
     * Le défaut que la règle ferme, mesuré là où il coûte : l'endpoint ANONYME qui rend le
     * téléphone du contact principal. Sans la règle, le tiers devient le plus ancien collaborateur
     * `agent`, et c'est son numéro que la fiche publie.
     */
    public function test_le_contact_public_ne_rend_pas_le_telephone_d_un_tiers(): void
    {
        $agence = Agency::factory()->create();
        $bailleur = User::factory()->create(['phone' => '+221770000001']);
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $property = Property::factory()->published()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $tiers = User::factory()->create(['phone' => '+221770000002']);

        Sanctum::actingAs($bailleur);
        $this->ajouter($property, $tiers, CollaboratorRole::Agent)->assertStatus(422);

        $this->getJson("/api/public/properties/{$property->slug}/contact")
            ->assertOk()
            ->assertJsonPath('phone', '+221770000001');
    }
}
