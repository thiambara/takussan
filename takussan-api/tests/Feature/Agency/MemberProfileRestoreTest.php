<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-1450 (P92.02) — les profils d'agence se suppriment en douceur, et l'unicité
 * `(user_id, agency_id)` de leurs tables est pleine. Repasser un membre à un rôle qu'il a déjà
 * tenu, ou réajouter un membre retiré, tentait un INSERT sur une paire déjà prise par la ligne
 * supprimée : 500. Les écrivains passent désormais par le chemin qui restaure
 * (`ProfileMaterializer`, ex-`UserRoleController::materializeOrRestore`).
 */
class MemberProfileRestoreTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $this->agency->id]);
    }

    private function membre(): User
    {
        $membre = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $membre->id, 'agency_id' => $this->agency->id]);

        return $membre;
    }

    private function role(User $membre, string $role)
    {
        return $this->putJson("/api/agencies/{$this->agency->id}/members/{$membre->id}/role", ['role' => $role]);
    }

    public function test_agent_admin_agent_aller_retour(): void
    {
        $membre = $this->membre();
        $agentId = AgentProfile::query()->where('user_id', $membre->id)->value('id');

        $this->role($membre, 'agency_admin')->assertOk();
        $this->role($membre, 'agent')->assertOk();
        $this->role($membre, 'agency_admin')->assertOk();

        $this->assertSame(1, AgentProfile::withTrashed()->where('user_id', $membre->id)->count());
        $this->assertSame(1, AgencyAdminProfile::withTrashed()->where('user_id', $membre->id)->count());
        $this->assertTrue(AgentProfile::withTrashed()->findOrFail($agentId)->trashed());
        $this->assertNotNull(AgencyAdminProfile::query()->where('user_id', $membre->id)->first());
    }

    public function test_bailleur_agent_bailleur_aller_retour(): void
    {
        $membre = $this->membre();

        $this->role($membre, 'owner')->assertOk();
        $this->role($membre, 'agent')->assertOk();
        $this->role($membre, 'owner')->assertOk();

        $this->assertSame(1, OwnerProfile::query()->where('user_id', $membre->id)->count());
        $this->assertSame(0, AgentProfile::query()->where('user_id', $membre->id)->count());
    }

    public function test_un_membre_retire_se_reajoute(): void
    {
        $membre = $this->membre();

        $this->deleteJson("/api/agencies/{$this->agency->id}/agents/{$membre->id}?leave_unassigned=1")
            ->assertSuccessful();
        $this->assertSame(0, AgentProfile::query()->where('user_id', $membre->id)->count());

        // TCK-2365 (P242.01) — le retour passe par l'invitation, acceptée par le compte.
        $this->postJson("/api/agencies/{$this->agency->id}/agents/invite", [
            'email' => $membre->email, 'role' => 'agent', 'first_name' => 'Awa', 'last_name' => 'Diop',
        ])->assertCreated();
        $token = Invitation::query()->latest('id')->value('token');
        $this->actingAs($membre, 'sanctum');
        $this->postJson("/api/invitations/{$token}/accept")->assertOk();

        $profil = AgentProfile::query()->where('user_id', $membre->id)->sole();
        $this->assertSame('active', $profil->getRawOriginal('status'));
        $this->assertSame(1, AgentProfile::withTrashed()->where('user_id', $membre->id)->count());
    }
}
