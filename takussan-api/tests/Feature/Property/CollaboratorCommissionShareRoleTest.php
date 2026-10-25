<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1448 (P86.03, ADR-0049 « Ventilation » § 1) — le grand livre ne sert que les parts des
 * collaborateurs `agent`. Une part posée sur un `manager`, un `co_owner` ou un `viewer` n'était
 * versée à personne, et comptait pourtant dans le plafond de 100 % : 70 % sur un `co_owner`
 * interdisaient de donner plus de 30 % aux agents. Une part positive hors du rôle `agent` est
 * désormais refusée, et un changement de rôle hors d'`agent` retire la part de la ligne.
 */
class CollaboratorCommissionShareRoleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $agence = Agency::factory()->create();
        $this->owner = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agence->id]);
        $this->property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $agence->id]);

        // TCK-2364 (P241.01) — la part ne s'écrit que par le personnel de l'agence qui tient
        // `leases.create` : ces cas la posent en admin de l'agence, plus en bailleur.
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        Sanctum::actingAs($admin);
    }

    private function agent(): User
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->property->agency_id]);

        return $agent;
    }

    private function ajouter(User $user, CollaboratorRole $role, mixed $share): TestResponse
    {
        return $this->postJson("/api/properties/{$this->property->id}/collaborators", [
            'user_id' => $user->id,
            'role' => $role->value,
            'commission_share' => $share,
        ]);
    }

    private function ligne(CollaboratorRole $role, ?float $share): PropertyCollaborator
    {
        return PropertyCollaborator::create([
            'property_id' => $this->property->id,
            'user_id' => $this->agent()->id,
            'role' => $role->value,
            'commission_share' => $share,
            'invited_at' => now(),
        ]);
    }

    public function test_une_part_hors_du_role_agent_est_refusee_a_l_ajout(): void
    {
        $this->ajouter($this->agent(), CollaboratorRole::Manager, 70)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('commission_share');
        $this->ajouter($this->agent(), CollaboratorRole::Viewer, 5)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('commission_share');

        $this->assertDatabaseCount('property_collaborators', 0);
    }

    public function test_sans_part_ou_a_zero_le_role_hors_agent_reste_accepte(): void
    {
        $this->ajouter($this->agent(), CollaboratorRole::Manager, null)->assertCreated();
        $this->ajouter($this->agent(), CollaboratorRole::Viewer, 0)->assertCreated();
    }

    public function test_un_agent_garde_sa_part_et_son_plafond(): void
    {
        $this->ajouter($this->agent(), CollaboratorRole::Agent, 60)->assertCreated();
        $this->ajouter($this->agent(), CollaboratorRole::Agent, 50)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('commission_share');
        $this->ajouter($this->agent(), CollaboratorRole::Agent, 40)->assertCreated();
    }

    public function test_une_part_hors_du_role_agent_est_refusee_a_la_modification(): void
    {
        $manager = $this->ligne(CollaboratorRole::Manager, null);
        $agent = $this->ligne(CollaboratorRole::Agent, 30);

        $this->putJson("/api/properties/{$this->property->id}/collaborators/{$manager->id}", ['commission_share' => 10])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('commission_share');
        $this->putJson("/api/properties/{$this->property->id}/collaborators/{$agent->id}", [
            'role' => CollaboratorRole::Manager->value,
            'commission_share' => 30,
        ])->assertUnprocessable()->assertJsonValidationErrors('commission_share');

        $this->assertNull($manager->refresh()->commission_share);
        $this->assertSame(CollaboratorRole::Agent->value, $agent->refresh()->getRawOriginal('role'));
    }

    public function test_quitter_le_role_agent_retire_la_part_et_libere_le_plafond(): void
    {
        $agent = $this->ligne(CollaboratorRole::Agent, 70);

        $this->putJson("/api/properties/{$this->property->id}/collaborators/{$agent->id}", [
            'role' => CollaboratorRole::Manager->value,
        ])->assertOk()->assertJsonPath('data.commission_share', null);

        $this->assertNull($agent->refresh()->commission_share);
        $this->ajouter($this->agent(), CollaboratorRole::Agent, 100)->assertCreated();
    }
}
