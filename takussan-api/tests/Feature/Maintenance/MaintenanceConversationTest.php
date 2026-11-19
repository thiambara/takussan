<?php

namespace Tests\Feature\Maintenance;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Services\Model\MaintenanceRequestService;
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

        // TCK-2958 (ADR-0128 § 3) — l'avis d'étape est un `event` sur la demande, au code fermé ;
        // `content` = le code, sans auteur, et aucun avis système d'intervention n'est plus écrit.
        $avis = Message::query()->where('type', MessageType::Event->value)->orderBy('id')->get();

        $this->assertSame(
            [['maintenance.assigned', 'open'], ['maintenance.accepted', 'open'], ['maintenance.transition', 'in_progress']],
            $avis->map(fn (Message $m) => [$m->metadata['code'], $m->metadata['data']['status']])->all(),
        );
        foreach ($avis as $m) {
            $this->assertSame($m->metadata['code'], $m->content);
            $this->assertNull($m->sender_id);
            // `jsonb` ordonne ses clés à sa façon : on compare des ensembles.
            $this->assertEquals(['type' => 'maintenance_request', 'id' => $mr->id], $m->metadata['object']);
            // TCK-2959 : `action_for` est toujours écrit, vide quand aucun geste n'est attendu.
            $this->assertEqualsCanonicalizing(['object', 'code', 'data', 'action_for'], array_keys($m->metadata));
            $this->assertSame([], $m->metadata['action_for']);
        }
        $this->assertSame(trim($provider->first_name.' '.$provider->last_name) ?: $provider->username, $avis[0]->metadata['data']['provider_name']);
        $this->assertSame(0, Message::query()->where('type', MessageType::System->value)->whereJsonContains('metadata->event', 'maintenance')->count());
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

    /**
     * TCK-2957 (AC2, ADR-0128 § 1) — le fil ouvert à la première assignation NAÎT avec son sujet :
     * la reprise de la migration ne couvre que les fils d'avant, celui-ci est créé après elle.
     */
    public function test_le_fil_ouvert_a_la_premiere_assignation_porte_son_sujet(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        $conversation = Conversation::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertSame('maintenance_request', $conversation->subject_type);
        $this->assertSame($mr->id, $conversation->subject_id);
        $this->assertSame($conversation->id, Conversation::query()->deSujet($mr)->sole()->id);
    }

    /** Sans assignation, aucun fil n'est ouvert : un changement de statut seul ne crée rien. */
    public function test_no_thread_without_assignment(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'acknowledged'])->assertOk();

        $this->assertSame(0, Conversation::query()->where('maintenance_request_id', $mr->id)->count());
    }

    /**
     * TCK-1756 (P154.01) — le fil suit `assigned_to`, pas la relation `assignee` restée en mémoire :
     * sur une instance qui l'a chargée, réassigner gardait l'ancien prestataire dans le fil, n'y
     * ajoutait pas le nouveau, et le message nommait l'ancien.
     */
    public function test_reassigner_une_instance_qui_a_charge_l_assignee_suit_le_nouveau_prestataire(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $first = $this->providerFor($agency);
        $second = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $first->id])->assertOk();

        $instance = MaintenanceRequest::query()->findOrFail($mr->id)->load('assignee');
        app(MaintenanceRequestService::class)->assign($instance, $second, $landlord);

        $conversation = Conversation::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertEqualsCanonicalizing([$landlord->id, $second->id, $tenant->id], $this->activeIds($conversation));
        $dernier = Message::query()->where('conversation_id', $conversation->id)
            ->where('type', MessageType::Event->value)->latest('id')->firstOrFail();
        // TCK-2958 — l'avis d'étape est un `event` au metadata fermé.
        $this->assertSame('maintenance.assigned', $dernier->metadata['code']);
        $this->assertSame(trim($second->first_name.' '.$second->last_name) ?: $second->username, $dernier->metadata['data']['provider_name']);
    }

    /** TCK-1756 (P154.01) — le prestataire qui refuse n'est pas remis dans le fil par la relation chargée. */
    public function test_le_refus_sur_une_instance_qui_a_charge_l_assignee_sort_le_prestataire(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        $instance = MaintenanceRequest::query()->findOrFail($mr->id)->load('assignee');
        app(MaintenanceRequestService::class)->decline($instance, $provider, 'Indisponible');

        $conversation = Conversation::query()->where('maintenance_request_id', $mr->id)->sole();
        $this->assertEqualsCanonicalizing([$landlord->id, $tenant->id], $this->activeIds($conversation));
    }

    /** @return list<int> */
    private function activeIds(Conversation $conversation): array
    {
        return $conversation->participants()->wherePivotNull('left_at')->pluck('users.id')
            ->map(fn ($id) => (int) $id)->all();
    }
}
