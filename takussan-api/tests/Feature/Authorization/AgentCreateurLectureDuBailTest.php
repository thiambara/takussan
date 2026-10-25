<?php

namespace Tests\Feature\Authorization;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use App\Services\Messaging\ConversationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1926 (P190.04, décision du porteur) — `LeaseService::create` recopie le créateur du bien en
 * `landlord_id` : sur un bien saisi par un agent, le bail le désigne. `LeasePolicy::view` et la liste
 * lisaient la colonne telle quelle, et l'agent suspendu ou retiré lisait encore le bail, le voyait
 * dans sa liste et gardait son fil. La branche du bailleur se juge par `BailleurDuBien::est`.
 */
class AgentCreateurLectureDuBailTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function bailDe(User $landlord): Lease
    {
        return Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);
    }

    private function assertNeLitPlus(User $agent, Lease $lease): void
    {
        $agent = $agent->fresh();
        $this->assertFalse($agent->can('view', $lease->fresh()));

        Sanctum::actingAs($agent);
        $this->getJson("/api/leases/{$lease->id}")->assertForbidden();
        $this->assertNotContains($lease->id, collect($this->getJson('/api/leases')->assertOk()->json('data'))->pluck('id')->all());
    }

    public function test_l_agent_createur_actif_lit_le_bail_au_titre_du_personnel(): void
    {
        $lease = $this->bailDe($this->agent);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/leases/{$lease->id}")->assertOk();
        $this->assertContains($lease->id, collect($this->getJson('/api/leases')->json('data'))->pluck('id')->all());
    }

    public function test_l_agent_createur_suspendu_ne_lit_plus_le_bail(): void
    {
        $lease = $this->bailDe($this->agent);

        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertNeLitPlus($this->agent, $lease);
    }

    public function test_l_agent_createur_retire_ne_lit_plus_le_bail_et_quitte_son_fil(): void
    {
        $lease = $this->bailDe($this->agent);
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Bail',
            'created_by' => $this->agent->id,
            'lease_id' => $lease->id,
        ]);
        $fil->participants()->attach($this->agent->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);

        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertNeLitPlus($this->agent, $lease);
        $this->assertFalse(app(ConversationAccess::class)->allows($this->agent->fresh(), $fil->fresh()));
    }

    /** Témoin : le bailleur du bien, suspendu dans l'agence, garde la lecture (voie étroite de `BailleurDuBien`). */
    public function test_le_bailleur_du_bien_garde_la_lecture(): void
    {
        $lease = $this->bailDe($this->landlord);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/leases/{$lease->id}")->assertOk();
        $this->assertContains($lease->id, collect($this->getJson('/api/leases')->json('data'))->pluck('id')->all());
    }

    /** Témoin : un bail d'un bien de particulier (sans agence) reste lu par celui qu'il désigne. */
    public function test_le_bailleur_particulier_garde_la_lecture(): void
    {
        $particulier = User::factory()->create();
        $lease = Lease::factory()->create([
            'agency_id' => null,
            'landlord_id' => $particulier->id,
            'status' => LeaseStatus::Active,
        ]);

        Sanctum::actingAs($particulier);
        $this->getJson("/api/leases/{$lease->id}")->assertOk();
        $this->assertContains($lease->id, collect($this->getJson('/api/leases')->json('data'))->pluck('id')->all());
    }
}
