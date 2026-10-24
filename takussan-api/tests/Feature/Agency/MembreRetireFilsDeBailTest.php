<?php

namespace Tests\Feature\Agency;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-1711 (P153.04) — le retrait d'un membre quitte (`left_at`) les fils de bail de l'agence dont
 * il ne lit plus le bail : `ConversationAccess` n'a pas de branche « bail », et le retiré lisait et
 * écrivait encore dans le fil d'un bail que `LeasePolicy::view` lui refuse. Les autres participants
 * gardent le fil.
 */
class MembreRetireFilsDeBailTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_le_retrait_quitte_les_fils_des_baux_que_le_retire_ne_lit_plus(): void
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $lease->forceFill(['agency_id' => $agency->id])->save();
        $agent = $this->agentOf($agency);

        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Bail',
            'created_by' => $agent->id,
            'lease_id' => $lease->id,
        ]);
        $fil->participants()->attach($agent->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $fil->participants()->attach($tenant->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $this->assertTrue(app(ConversationAccess::class)->allows($agent, $fil), 'avant le retrait');

        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $admin, leaveUnassigned: true);

        $retire = $agent->fresh();
        $this->assertFalse($retire->can('view', $lease->fresh()));
        $this->assertFalse(app(ConversationAccess::class)->allows($retire, $fil->fresh()));
        $this->assertTrue(app(ConversationAccess::class)->allows($tenant, $fil->fresh()), 'le locataire garde le fil');

        Sanctum::actingAs($retire);
        $this->getJson("/api/conversations/{$fil->id}/messages")->assertForbidden();
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Toujours là'])->assertForbidden();
    }

    /**
     * P191.02 (TCK-2021) — le groupe rattaché au seul bien (`property_id`, sans bail), que
     * `NewGroupDialog` ouvre, se quitte aussi quand le retiré ne lit plus le bien
     * (`PropertyPolicy::view`) ; le locataire le garde.
     */
    public function test_p191_02_le_retrait_quitte_aussi_les_groupes_des_biens_que_le_retire_ne_lit_plus(): void
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $agent = $this->agentOf($agency);

        $groupe = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Bien',
            'created_by' => $agent->id,
            'property_id' => $property->id,
        ]);
        $groupe->participants()->attach($agent->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $groupe->participants()->attach($tenant->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $this->assertTrue(app(ConversationAccess::class)->allows($agent, $groupe), 'avant le retrait');

        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $admin, leaveUnassigned: true);

        $retire = $agent->fresh();
        $this->assertFalse($retire->can('view', $property->fresh()));
        $this->assertFalse(app(ConversationAccess::class)->allows($retire, $groupe->fresh()));
        $this->assertTrue(app(ConversationAccess::class)->allows($tenant, $groupe->fresh()), 'le locataire garde le groupe');

        Sanctum::actingAs($retire);
        $this->getJson("/api/conversations/{$groupe->id}/messages")->assertForbidden();
        $this->postJson("/api/conversations/{$groupe->id}/messages", ['content' => 'Toujours là'])->assertForbidden();
    }
}
