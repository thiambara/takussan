<?php

namespace Tests\Feature\Account;

use App\Models\AccountDeletionRequest;
use App\Models\Agency;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Notifications\CodedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2172 (P204.05, décision du porteur du 2026-10-24) — l'effacement fait les extinctions du
 * retrait, par la même méthode : la marque d'agent principal tombe et les délégations où figure le
 * compte sont révoquées. Le référent client reste un sujet à part.
 */
class EffacementMarquesEtDelegationsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->personnel($this->agence, 'agency_admin');
        $this->agent = $this->personnel($this->agence);
        $this->collegue = $this->personnel($this->agence);
    }

    private function effacer(User $user): void
    {
        $request = AccountDeletionRequest::factory()->for($user)->due()->create();
        app(AccountDeletionService::class)->executeDeletion($request);
    }

    public function test_la_marque_d_agent_principal_tombe(): void
    {
        $ligne = $this->collaborateur($this->bienDe($this->agence), $this->agent);
        $ligne->forceFill(['is_primary' => true])->save();

        $this->effacer($this->agent);

        $this->assertFalse((bool) $ligne->fresh()->is_primary);
        $this->assertNotNull($ligne->fresh(), 'la ligne reste');
    }

    public function test_les_delegations_ou_figure_le_compte_sont_revoquees(): void
    {
        $remplace = RoleDelegation::factory()->create([
            'agency_id' => $this->agence->id, 'user_id' => $this->collegue->id,
            'delegator_id' => $this->agent->id, 'replaces_user_id' => $this->agent->id,
        ]);
        $delegue = RoleDelegation::factory()->scheduled()->create([
            'agency_id' => $this->agence->id, 'user_id' => $this->agent->id, 'delegator_id' => $this->collegue->id,
        ]);
        $autre = RoleDelegation::factory()->create([
            'agency_id' => $this->agence->id, 'user_id' => $this->collegue->id, 'delegator_id' => $this->collegue->id,
        ]);

        $this->effacer($this->agent);

        $this->assertSame(RoleDelegationStatus::Revoked, $remplace->fresh()->status);
        $this->assertSame(RoleDelegationStatus::Revoked, $delegue->fresh()->status);
        $this->assertSame(RoleDelegationStatus::Active, $autre->fresh()->status);
        // Le compte effacé ne reçoit aucun avis de révocation.
        Notification::assertNotSentTo($this->agent, CodedNotification::class);
    }

    public function test_le_referent_client_reste_un_sujet_a_part(): void
    {
        $relation = UserCustomerRelationship::query()->create([
            'user_id' => $this->agent->id,
            'customer_id' => $this->ficheClient($this->agence)->id,
            'relationship_type' => 'agent_client',
            'is_primary' => true,
            'status' => RelationshipStatus::Active,
        ]);

        $this->effacer($this->agent);

        $this->assertTrue((bool) $relation->fresh()->is_primary);
    }
}
