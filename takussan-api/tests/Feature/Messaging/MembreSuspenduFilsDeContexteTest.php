<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P191.01 (TCK-2019) — le participant qui ne tient plus qu'un profil non actif
 * dans l'agence d'un fil de bail ou de bien, et qui n'est partie ni au bail ni au bien, n'y a plus
 * accès : ni lecture, ni écriture, ni liste, ni avis. Il n'en est pas
 * retiré (`left_at` reste nul) : réactivé, il retrouve le fil.
 */
class MembreSuspenduFilsDeContexteTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @return array{agency: Agency, lease: Lease, agent: User, tenant: User, landlord: User, admin: User, bail: Conversation, bien: Conversation} */
    private function scene(): array
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant, 'landlord' => $landlord] = $this->maintenanceScenario();
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $lease->forceFill(['agency_id' => $agency->id])->save();
        $agent = $this->agentOf($agency);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        $bail = $this->groupe($agent, ['lease_id' => $lease->id, 'property_id' => $property->id], [$tenant, $landlord]);
        $bien = $this->groupe($agent, ['property_id' => $property->id], [$tenant, $landlord]);

        return compact('agency', 'lease', 'agent', 'tenant', 'landlord', 'admin', 'bail', 'bien');
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

    public function test_p191_01_l_agent_suspendu_perd_les_fils_de_bail_et_de_bien_et_les_retrouve_reactive(): void
    {
        ['agency' => $agency, 'agent' => $agent, 'tenant' => $tenant, 'admin' => $admin, 'bail' => $bail, 'bien' => $bien] = $this->scene();
        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($agent, $bail), 'avant la suspension');
        $this->assertTrue($access->allows($agent, $bien), 'avant la suspension');

        app(TeamMemberSuspensionService::class)->suspend($agency, $agent, $admin);
        $suspendu = $agent->fresh();

        foreach ([$bail, $bien] as $fil) {
            $this->assertFalse($access->allows($suspendu, $fil->fresh()));
            $this->assertFalse($access->branchesAllow($suspendu, $fil->fresh()), 'pas d\'avis des messages');
            $this->assertTrue($access->allows($tenant, $fil->fresh()), 'le locataire garde le fil');
            $this->assertNull($fil->participants()->where('users.id', $suspendu->id)->first()->pivot->left_at, 'pas de left_at');
        }

        Sanctum::actingAs($suspendu);
        $this->getJson("/api/conversations/{$bail->id}/messages")->assertForbidden();
        $this->postJson("/api/conversations/{$bail->id}/messages", ['content' => 'Toujours là'])->assertForbidden();
        $this->getJson("/api/conversations/{$bien->id}/messages")->assertForbidden();
        $listes = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($bail->id, $listes);
        $this->assertNotContains($bien->id, $listes);
        $this->assertSame(0, $access->participatingQuery($suspendu)->count());

        app(TeamMemberSuspensionService::class)->reactivate($agency, $suspendu, $admin);
        $reactive = $suspendu->fresh();
        $this->assertTrue($access->allows($reactive, $bail->fresh()));
        $this->assertTrue($access->allows($reactive, $bien->fresh()));
        $this->assertSame(2, $access->participatingQuery($reactive)->count());
    }

    public function test_p191_01_le_bailleur_suspendu_reste_partie_au_bail_et_au_bien(): void
    {
        ['agency' => $agency, 'landlord' => $landlord, 'admin' => $admin, 'bail' => $bail, 'bien' => $bien] = $this->scene();

        app(TeamMemberSuspensionService::class)->suspend($agency, $landlord, $admin);
        $suspendu = $landlord->fresh();

        $access = app(ConversationAccess::class);
        $this->assertTrue($access->allows($suspendu, $bail->fresh()));
        $this->assertTrue($access->allows($suspendu, $bien->fresh()));
        $this->assertSame(2, $access->participatingQuery($suspendu)->count());
    }
}
