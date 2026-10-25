<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * P208.02 (TCK-2192) — l'acceptation ne fait passer `active` qu'un profil `draft` ; un profil
 * déjà `active` reste tel quel ; un profil suspendu ou inactif fait refuser l'acceptation par un
 * refus nommé (`invitation.profile_unavailable`), l'invitation intacte (décision du porteur du
 * 2026-10-24). La garde vaut sur le chemin générique de l'acceptation et sur le prestataire
 * réutilisé.
 *
 * Avant : `finalizeAccept()` posait `status = active` sur tout profil visé ; l'invitation qui
 * visait le profil suspendu d'un autre compte, dans une autre agence, levait la suspension.
 */
class AcceptationNActiveQueLeBrouillonTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Notification::fake();
    }

    private function invitation(Model $profil, string $role, string $email): Invitation
    {
        return Invitation::factory()->create([
            'email' => $email,
            'invited_by' => User::factory()->create()->id,
            'agency_id' => Agency::factory()->create()->id,
            'invitable_type' => $profil::class,
            'invitable_id' => $profil->getKey(),
            'role' => $role,
            'status' => InvitationStatus::Sent->value,
        ]);
    }

    private function accepterEnCompteNeuf(Invitation $invitation): TestResponse
    {
        return $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'password' => 'sup3r-secret',
        ]);
    }

    public function test_le_profil_suspendu_d_un_autre_compte_reste_suspendu(): void
    {
        $titulaire = User::factory()->create();
        $profil = AgentProfile::factory()->create([
            'user_id' => $titulaire->id,
            'status' => AgentProfileStatus::Suspended->value,
        ]);
        $invitation = $this->invitation($profil, 'agent', 'tiers@example.com');

        $this->accepterEnCompteNeuf($invitation)
            ->assertStatus(409)
            ->assertJsonPath('code', 'invitation.profile_unavailable');

        $this->assertSame(AgentProfileStatus::Suspended, $profil->fresh()->status);
        $this->assertSame($titulaire->id, $profil->fresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
        $this->assertDatabaseMissing('users', ['email' => 'tiers@example.com']);
    }

    public function test_un_profil_inactif_fait_refuser_l_acceptation(): void
    {
        $profil = AgentProfile::factory()->create([
            'user_id' => null,
            'status' => AgentProfileStatus::Inactive->value,
        ]);
        $invitation = $this->invitation($profil, 'agent', 'inactif@example.com');

        $this->accepterEnCompteNeuf($invitation)->assertStatus(409);

        $this->assertSame(AgentProfileStatus::Inactive, $profil->fresh()->status);
        $this->assertNull($profil->fresh()->user_id);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    public function test_un_bailleur_bloque_fait_refuser_l_acceptation(): void
    {
        $profil = OwnerProfile::factory()->create([
            'user_id' => null,
            'status' => OwnerProfileStatus::Blocked->value,
        ]);
        $invitation = $this->invitation($profil, 'owner', 'bloque@example.com');

        $this->accepterEnCompteNeuf($invitation)->assertStatus(409);

        $this->assertSame(OwnerProfileStatus::Blocked, $profil->fresh()->status);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    public function test_le_prestataire_reutilise_suspendu_fait_refuser_l_acceptation(): void
    {
        $prestataire = User::factory()->create(['email' => 'presta@example.com']);
        $profil = ServiceProviderProfile::factory()->create([
            'user_id' => $prestataire->id,
            'status' => ServiceProviderProfileStatus::Suspended->value,
        ]);
        $invitation = $this->invitation($profil, 'service_provider', $prestataire->email);

        $this->actingAsApi($prestataire)
            ->postJson("/api/invitations/{$invitation->token}/accept")
            ->assertStatus(409)
            ->assertJsonPath('code', 'invitation.profile_unavailable');

        $this->assertSame(ServiceProviderProfileStatus::Suspended, $profil->fresh()->status);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
        $this->assertDatabaseMissing('service_provider_agency_collaborations', [
            'service_provider_profile_id' => $profil->id,
            'agency_id' => $invitation->agency_id,
        ]);
    }

    public function test_temoin_un_profil_deja_actif_reste_actif_et_l_acceptation_passe(): void
    {
        $prestataire = User::factory()->create(['email' => 'actif@example.com']);
        $profil = ServiceProviderProfile::factory()->create([
            'user_id' => $prestataire->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        $invitation = $this->invitation($profil, 'service_provider', $prestataire->email);

        $this->actingAsApi($prestataire)
            ->postJson("/api/invitations/{$invitation->token}/accept")
            ->assertOk();

        $this->assertSame(ServiceProviderProfileStatus::Active, $profil->fresh()->status);
        $this->assertSame(InvitationStatus::Accepted, $invitation->fresh()->status);
    }

    public function test_temoin_le_brouillon_passe_actif(): void
    {
        $profil = AgentProfile::factory()->create([
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);
        $invitation = $this->invitation($profil, 'agent', 'brouillon@example.com');

        $this->accepterEnCompteNeuf($invitation)->assertOk();

        $this->assertSame(AgentProfileStatus::Active, $profil->fresh()->status);
        $this->assertNotNull($profil->fresh()->user_id);
    }
}
