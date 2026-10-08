<?php

namespace Tests\Feature\Maintenance;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC22 (P19), moitié fil : une conversation par intervention, créée à la première
 * assignation, qui suit les changements de prestataire et reçoit un avis d'étape à chaque
 * `MaintenanceStatusChanged`.
 *
 * Une conversation pouvait porter `maintenance_request_id`, mais rien ne la créait.
 */
class MaintenanceConversationTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_first_assignment_opens_one_thread_and_reassignment_swaps_the_provider(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $first = $this->providerFor($agency);
        $second = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $conversationId = $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $first->id])
            ->assertOk()->json('data.conversation_id');

        $conversation = Conversation::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertSame($conversation->id, $conversationId);
        $this->assertEqualsCanonicalizing([$landlord->id, $first->id, $tenant->id], $this->activeIds($conversation));

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $second->id])->assertOk();

        $this->assertSame(1, Conversation::query()->where('maintenance_request_id', $mr->id)->count());
        $this->assertEqualsCanonicalizing([$landlord->id, $second->id, $tenant->id], $this->activeIds($conversation));
    }

    public function test_each_status_change_posts_a_coded_system_message(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        $causes = Message::query()
            ->where('type', MessageType::System->value)
            ->whereJsonContains('metadata->event', SystemMessageFactory::EVENT_MAINTENANCE)
            ->orderBy('id')
            ->get()
            ->map(fn (Message $m) => [$m->metadata['cause'], $m->metadata['status']])
            ->all();

        $this->assertSame([['assigned', 'open'], ['accepted', 'open'], ['transition', 'in_progress']], $causes);
    }

    /** Le prestataire voit le fil depuis la fiche ; un refus l'en fait sortir. */
    public function test_provider_reaches_the_thread_and_leaves_it_on_decline(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        Sanctum::actingAs($provider);
        $conversationId = $this->getJson("/api/maintenance-requests/{$mr->id}")->json('data.conversation_id');
        $this->assertNotNull($conversationId);
        $this->postJson("/api/conversations/{$conversationId}/messages", ['content' => 'Je passe demain matin'])->assertCreated();

        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Indisponible'])->assertOk();
        $this->assertNotContains($provider->id, $this->activeIds(Conversation::query()->findOrFail($conversationId)));
    }

    /** Sans assignation, aucun fil n'est ouvert : un changement de statut seul ne crée rien. */
    public function test_no_thread_without_assignment(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'acknowledged'])->assertOk();

        $this->assertSame(0, Conversation::query()->where('maintenance_request_id', $mr->id)->count());
    }

    /** @return list<int> */
    private function activeIds(Conversation $conversation): array
    {
        return $conversation->participants()->wherePivotNull('left_at')->pluck('users.id')
            ->map(fn ($id) => (int) $id)->all();
    }
}
