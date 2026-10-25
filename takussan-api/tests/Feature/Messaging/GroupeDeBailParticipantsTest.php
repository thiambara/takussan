<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P191.04 (TCK-2191) — un groupe rattaché à un bail ne compte que des personnes qui lisent ce bail
 * (`LeasePolicy::view`), contrôlé à la création et à l'ajout de participants. Seule exception : le
 * prestataire assigné à une intervention de ce bail, dans le fil de cette intervention
 * (`docs/features.md` § 1.7, décision du porteur du 2026-10-24).
 */
class GroupeDeBailParticipantsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @return array{agency: Agency, property: Property, lease: Lease, agent: User, tenant: User, landlord: User, provider: User, mr: MaintenanceRequest, tiers: User, collegue: User} */
    private function scene(): array
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant, 'landlord' => $landlord, 'provider' => $provider, 'mr' => $mr] = $this->maintenanceScenario();
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $lease->forceFill(['agency_id' => $agency->id])->save();
        $mr->forceFill(['lease_id' => $lease->id])->save();
        $agent = $this->agentOf($agency);
        $collegue = $this->agentOf($agency);
        $tiers = User::factory()->create();

        // Tous correspondants de l'agent : la joignabilité ne doit pas être ce qui refuse.
        foreach ([$tenant, $landlord, $provider, $tiers, $collegue] as $autre) {
            $this->directe($agent, $autre);
        }

        return compact('agency', 'property', 'lease', 'agent', 'tenant', 'landlord', 'provider', 'mr', 'tiers', 'collegue');
    }

    private function directe(User $a, User $b): void
    {
        $fil = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $a->id,
        ]);
        $fil->participants()->attach([
            $a->id => ['role' => ParticipantRole::Member->value, 'joined_at' => now()],
            $b->id => ['role' => ParticipantRole::Member->value, 'joined_at' => now()],
        ]);
    }

    /** @param list<User> $membres */
    private function groupe(User $admin, array $contexte, array $membres): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ] + $contexte);
        $fil->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        }

        return $fil;
    }

    public function test_la_creation_refuse_un_participant_qui_ne_lit_pas_le_bail(): void
    {
        ['lease' => $lease, 'agent' => $agent, 'tenant' => $tenant, 'tiers' => $tiers] = $this->scene();
        $this->assertFalse($tiers->can('view', $lease));
        Sanctum::actingAs($agent);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Bail',
            'lease_id' => $lease->id,
            'participants' => [$tenant->id, $tiers->id],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['participants' => __('messaging.errors.participants_cannot_read_lease')]);

        $this->assertSame(0, Conversation::query()->where('lease_id', $lease->id)->count());
    }

    public function test_la_creation_admet_les_parties_et_le_personnel_et_un_tiers_sans_bail(): void
    {
        ['property' => $property, 'lease' => $lease, 'agent' => $agent, 'tenant' => $tenant, 'landlord' => $landlord, 'collegue' => $collegue, 'tiers' => $tiers] = $this->scene();
        Sanctum::actingAs($agent);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Bail',
            'lease_id' => $lease->id,
            'participants' => [$tenant->id, $landlord->id, $collegue->id],
        ])->assertCreated();

        // Le tiers se joint par un groupe sans bail rattaché.
        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Bien',
            'property_id' => $property->id,
            'participants' => [$tenant->id, $tiers->id],
        ])->assertCreated();
    }

    /**
     * TCK-2372 (P250.03) — l'exception du prestataire assigné ne vaut plus à la création manuelle :
     * un groupe créé à la main ne porte plus d'intervention, le fil naît de l'assignation
     * (`SyncMaintenanceConversation`, par le service). Elle vaut toujours à l'ajout, dans ce fil.
     */
    public function test_la_creation_manuelle_ne_rattache_pas_l_intervention_et_refuse_le_prestataire_qui_ne_lit_pas_le_bail(): void
    {
        ['lease' => $lease, 'agent' => $agent, 'tenant' => $tenant, 'provider' => $provider, 'mr' => $mr] = $this->scene();
        $this->assertFalse($provider->can('view', $lease));
        Sanctum::actingAs($agent);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Intervention',
            'lease_id' => $lease->id,
            'maintenance_request_id' => $mr->id,
            'participants' => [$tenant->id, $provider->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['maintenance_request_id']);

        $this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Bail',
            'lease_id' => $lease->id,
            'participants' => [$tenant->id, $provider->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['participants']);
    }

    public function test_l_ajout_refuse_un_participant_qui_ne_lit_pas_le_bail(): void
    {
        ['property' => $property, 'lease' => $lease, 'agent' => $agent, 'tenant' => $tenant, 'landlord' => $landlord, 'collegue' => $collegue, 'tiers' => $tiers] = $this->scene();
        $fil = $this->groupe($agent, ['lease_id' => $lease->id, 'property_id' => $property->id], [$tenant, $landlord]);
        Sanctum::actingAs($agent);

        $this->postJson("/api/conversations/{$fil->id}/participants", ['user_ids' => [$tiers->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids' => __('messaging.errors.participants_cannot_read_lease')]);
        $this->assertNull($fil->participants()->where('users.id', $tiers->id)->first());

        $this->postJson("/api/conversations/{$fil->id}/participants", ['user_ids' => [$collegue->id]])
            ->assertSuccessful();
    }

    public function test_l_ajout_admet_le_prestataire_assigne_dans_le_fil_de_son_intervention(): void
    {
        ['property' => $property, 'lease' => $lease, 'agent' => $agent, 'tenant' => $tenant, 'landlord' => $landlord, 'provider' => $provider, 'mr' => $mr] = $this->scene();
        $intervention = $this->groupe($agent, ['lease_id' => $lease->id, 'property_id' => $property->id, 'maintenance_request_id' => $mr->id], [$tenant, $landlord]);
        $bail = $this->groupe($agent, ['lease_id' => $lease->id, 'property_id' => $property->id], [$tenant, $landlord]);
        Sanctum::actingAs($agent);

        $this->postJson("/api/conversations/{$intervention->id}/participants", ['user_ids' => [$provider->id]])
            ->assertSuccessful();
        $this->postJson("/api/conversations/{$bail->id}/participants", ['user_ids' => [$provider->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['user_ids']);
    }
}
