<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2665 — `DELETE /api/invitations/expired?filter[role]=…` : supprime les invitations EXPIRÉES de
 * l'agence active, des rôles demandés ; double authentification exigée (`ProtectedActions`).
 */
class InvitationsPurgeExpiredTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    private function invitation(string $role, InvitationStatus $status, bool $past, ?Agency $agency = null): Invitation
    {
        return Invitation::factory()->create([
            'agency_id' => ($agency ?? $this->agency)->id, 'role' => $role, 'status' => $status->value,
            'expires_at' => $past ? now()->subDay() : now()->addDays(3),
        ]);
    }

    public function test_ac4_seules_les_expirees_des_roles_demandes_de_l_agence_active_partent(): void
    {
        $gone = [
            $this->invitation('agent', InvitationStatus::Expired, true),
            $this->invitation('agency_admin', InvitationStatus::Expired, true),
            // Passée, que le balayage horaire n'a pas encore marquée : expirée pour l'écran aussi.
            $this->invitation('agent', InvitationStatus::Sent, true),
        ];
        $kept = [
            $this->invitation('agent', InvitationStatus::Sent, false),
            $this->invitation('tenant', InvitationStatus::Expired, true),
            $this->invitation('agent', InvitationStatus::Expired, true, Agency::factory()->create()),
            $this->invitation('agent', InvitationStatus::Accepted, true),
            $this->invitation('agent', InvitationStatus::Revoked, true),
        ];
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
        $before = Invitation::query()->count();

        $this->deleteJson('/api/invitations/expired?filter[role]=agent,agency_admin')
            ->assertOk()
            ->assertExactJson(['deleted' => 3]);

        $this->assertSame($before - 3, Invitation::query()->count());
        foreach ($gone as $invitation) {
            $this->assertNull(Invitation::query()->find($invitation->id));
        }
        foreach ($kept as $invitation) {
            $this->assertNotNull(Invitation::query()->find($invitation->id));
        }

        $log = Activity::query()->where('event', 'invitations_expired_purged')->sole();
        $this->assertSame($admin->id, (int) $log->causer_id);
        $this->assertSame(3, $log->properties['count']);
        $this->assertSame(['agent', 'agency_admin'], $log->properties['roles']);
        $this->assertStringNotContainsString('@', json_encode($log->properties->all()));
    }

    public function test_une_invitation_de_bailleur_purgee_delie_ses_biens(): void
    {
        $profile = OwnerProfile::factory()->create(['agency_id' => $this->agency->id]);
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $profile->id]);
        Invitation::factory()->create([
            'agency_id' => $this->agency->id, 'role' => 'owner', 'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->subHour(), 'invitable_type' => OwnerProfile::class, 'invitable_id' => $profile->id,
        ]);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->deleteJson('/api/invitations/expired?filter[role]=owner')->assertOk()->assertExactJson(['deleted' => 1]);

        $this->assertNull($property->fresh()->pending_owner_profile_id);
    }

    public function test_ac5_sans_second_facteur_le_refus_de_protected_actions_et_rien_ne_part(): void
    {
        $expired = $this->invitation('agent', InvitationStatus::Expired, true);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false, 'two_factor_secret' => null]);

        $this->deleteJson('/api/invitations/expired?filter[role]=agent')
            ->assertForbidden()
            ->assertJsonPath('code', 'two_factor_required');

        $this->assertNotNull(Invitation::query()->find($expired->id));
    }

    public function test_sans_team_invite_403_avant_la_validation(): void
    {
        $expired = $this->invitation('agent', InvitationStatus::Expired, true);
        $this->apiActingAsRole('agent', ['agency' => $this->agency]);

        $this->deleteJson('/api/invitations/expired?filter[role]=agent')->assertForbidden();
        $this->deleteJson('/api/invitations/expired')->assertForbidden();
        $this->assertNotNull(Invitation::query()->find($expired->id));
    }

    public function test_les_roles_sont_exiges_et_connus(): void
    {
        $this->invitation('agent', InvitationStatus::Expired, true);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->deleteJson('/api/invitations/expired')->assertStatus(422);
        $this->deleteJson('/api/invitations/expired?filter[role]=,')->assertStatus(422);
        $this->deleteJson('/api/invitations/expired?filter[role]=agent,super_admin')->assertStatus(422);
        $this->deleteJson('/api/invitations/expired?filter[role]=inconnu')->assertStatus(422);
        $this->assertSame(1, Invitation::query()->count());
    }
}
