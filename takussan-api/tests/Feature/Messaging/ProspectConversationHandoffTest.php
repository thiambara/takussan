<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Agency\AgentHandoverService;
use App\Services\Property\PrimaryAgentDesignator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * P38.05, TCK-888 (ADR-0068 § 1 et 3) — les chemins qui déplacent le contact principal par une
 * écriture transmettent le fil du prospect sans attendre sa relance : désignation, retrait ou
 * changement de rôle d'une collaboration, passation du portefeuille. Et `POST /api/conversations`
 * ne crée plus de directe rattachée à un bien : le résolveur reste le seul écrivain de ces fils.
 */
class ProspectConversationHandoffTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $first;

    private User $second;

    private User $prospect;

    private Property $property;

    private PropertyCollaborator $firstLine;

    private PropertyCollaborator $secondLine;

    private int $conversationId;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Queue::fake();

        $this->agency = $this->agence();
        $this->admin = $this->personnel($this->agency, 'agency_admin');
        $this->first = $this->personnel($this->agency);
        $this->second = $this->personnel($this->agency);
        $this->prospect = User::factory()->create();
        $this->property = $this->bienDe($this->agency);
        $this->firstLine = $this->collaborateur($this->property, $this->first, '2026-01-10 09:00:00');
        $this->secondLine = $this->collaborateur($this->property, $this->second, '2026-05-20 09:00:00');

        Sanctum::actingAs($this->prospect);
        $this->conversationId = $this->postJson("/api/public/properties/{$this->property->slug}/contact-message", [
            'message' => 'Mon numero 77 000 00 00',
        ])->assertCreated()->json('data.conversation_id');

        $this->assertActiveResponder($this->first);
    }

    private function assertActiveResponder(User $responder): void
    {
        $active = DB::table('conversation_participants')
            ->where('conversation_id', $this->conversationId)
            ->whereNull('left_at')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->sort()->values()->all();

        $expected = collect([$this->prospect->id, $responder->id])->sort()->values()->all();
        $this->assertSame($expected, $active);
    }

    public function test_designating_another_primary_agent_hands_the_thread_over(): void
    {
        app(PrimaryAgentDesignator::class)->designate($this->property, $this->secondLine, $this->admin);

        $this->assertActiveResponder($this->second);
    }

    public function test_removing_the_responder_s_collaboration_hands_the_thread_over(): void
    {
        $this->actingAsApi($this->admin)
            ->apiDelete("/api/properties/{$this->property->id}/collaborators/{$this->firstLine->id}")
            ->assertNoContent();

        $this->assertActiveResponder($this->second);
    }

    public function test_changing_the_responder_s_role_hands_the_thread_over(): void
    {
        $this->actingAsApi($this->admin)
            ->apiPut("/api/properties/{$this->property->id}/collaborators/{$this->firstLine->id}", ['role' => CollaboratorRole::Viewer->value])
            ->assertOk();

        $this->assertActiveResponder($this->second);
    }

    public function test_the_portfolio_handover_hands_the_thread_over(): void
    {
        $successor = $this->personnel($this->agency);

        app(AgentHandoverService::class)->transfer($this->agency, $this->first, ['collaborations' => $successor], $this->admin);

        $this->assertActiveResponder($successor);
    }

    public function test_a_direct_conversation_cannot_be_attached_to_a_property_through_the_generic_endpoint(): void
    {
        $this->actingAsApi($this->first)
            ->apiPost('/api/conversations', [
                'participants' => [$this->second->id],
                'property_id' => $this->property->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['property_id']);
    }
}
