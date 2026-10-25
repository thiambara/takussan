<?php

namespace Tests\Feature\Maintenance;

use App\Listeners\Maintenance\SyncMaintenanceConversation;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2372 (P250.03, décision du porteur du 2026-10-25) — le fil d'une intervention se lit par
 * `MaintenanceRequest::conversation()` seule : le plus ancien GROUPE qui porte la demande.
 *
 * Avant : la relation était un `HasOne` sans filtre de type ni ordre, que personne ne lisait, et le
 * fil se lisait ailleurs, par `SyncMaintenanceConversation::conversationFor`. Deux lectures du même
 * fait, dont une fausse qui attendait son premier lecteur.
 */
class FilDeLInterventionParLaRelationTest extends TestCase
{
    use RefreshDatabase;

    private function conversation(MaintenanceRequest $mr, ConversationType $type, User $createur): Conversation
    {
        return Conversation::create([
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'subject' => $type === ConversationType::Group ? 'Fil' : null,
            'created_by' => $createur->id,
            'maintenance_request_id' => $mr->id,
        ]);
    }

    public function test_la_relation_rend_le_plus_ancien_groupe_jamais_une_directe(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $createur = User::factory()->create();
        // Une directe plus ancienne que le fil, puis deux groupes.
        $this->conversation($mr, ConversationType::Direct, $createur);
        $fil = $this->conversation($mr, ConversationType::Group, $createur);
        $this->conversation($mr, ConversationType::Group, $createur);

        $this->assertSame($fil->id, $mr->conversation()->first()?->id);
        $this->assertSame($fil->id, $mr->fresh()->conversation?->id);
        // Chargée en lot, la relation rend le même fil.
        $this->assertSame($fil->id, MaintenanceRequest::query()->with('conversation')->findOrFail($mr->id)->conversation?->id);
    }

    public function test_une_intervention_sans_groupe_n_a_pas_de_fil(): void
    {
        $mr = MaintenanceRequest::factory()->create();
        $this->conversation($mr, ConversationType::Direct, User::factory()->create());

        $this->assertNull($mr->conversation()->first());
    }

    public function test_la_seconde_lecture_du_fil_est_retiree(): void
    {
        $this->assertFalse(method_exists(SyncMaintenanceConversation::class, 'conversationFor'));
    }
}
