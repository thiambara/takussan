<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1339 (P129.03) — une invitation ouverte d'une agence supprimée n'est
 * plus relancée et ne s'accepte plus : la suppression la révoque, et
 * l'acceptation d'une invitation dont l'agence n'existe plus rend 410.
 */
class InvitationAgenceSupprimeeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Agency, 1: User, 2: Invitation} */
    private function agencyWithOpenInvitation(): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $profile = OwnerProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => OwnerProfileStatus::Draft->value,
            'user_id' => null,
        ]);
        $invitation = Invitation::factory()->create([
            'email' => 'invite.agence.supprimee@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $agency->id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profile->id,
            'role' => 'owner',
            'status' => InvitationStatus::Sent->value,
        ]);

        return [$agency, $admin, $invitation];
    }

    private function accept(Invitation $invitation): TestResponse
    {
        return $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'password' => 'sup3r-secret',
        ]);
    }

    public function test_supprimer_l_agence_revoque_ses_invitations_ouvertes(): void
    {
        Mail::fake();
        [$agency, $admin, $invitation] = $this->agencyWithOpenInvitation();
        $autre = Invitation::factory()->create([
            'email' => 'autre.agence@example.com',
            'agency_id' => Agency::factory()->create()->id,
            'role' => 'owner',
            'status' => InvitationStatus::Sent->value,
        ]);

        Sanctum::actingAs($admin);
        $this->deleteJson("/api/agencies/{$agency->id}")->assertNoContent();

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Revoked, $invitation->status);
        $this->assertNotNull($invitation->revoked_at);
        $this->assertSame(InvitationStatus::Sent, $autre->refresh()->status);

        $reminded = app(InvitationService::class)->remindPending(now()->addDays(4));
        $this->assertFalse($reminded->contains('id', $invitation->id));

        $this->accept($invitation)->assertStatus(410)->assertJsonPath('code', 'invitation.token_revoked');
        $this->assertNull(User::query()->where('email', 'invite.agence.supprimee@example.com')->first());
    }

    public function test_une_invitation_restee_ouverte_d_une_agence_supprimee_ne_s_accepte_pas(): void
    {
        Mail::fake();
        [$agency, , $invitation] = $this->agencyWithOpenInvitation();
        // Agence supprimée sans passer par la route (ou avant ce correctif).
        $agency->delete();
        $this->assertSame(InvitationStatus::Sent, $invitation->refresh()->status);

        $this->accept($invitation)->assertStatus(410)->assertJsonPath('code', 'invitation.token_revoked');
        $this->assertSame(InvitationStatus::Sent, $invitation->refresh()->status);
        $this->assertNull(User::query()->where('email', 'invite.agence.supprimee@example.com')->first());
    }
}
