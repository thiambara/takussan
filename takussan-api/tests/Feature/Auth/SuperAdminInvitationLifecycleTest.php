<?php

namespace Tests\Feature\Auth;

use App\Mail\InvitationMailable;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-367 — cycle de vie d'une invitation de cooptation super-admin :
 * relance, annulation, expiration visible.
 *
 * ⚠ Nom de classe volontairement en `SuperAdminInvitation…` : l'AC6 du
 * ticket exige que `--filter=SuperAdminInvitation` les attrape, et la
 * classe historique s'appelle `SuperAdminCooptationTest`.
 */
class SuperAdminInvitationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Une invitation de cooptation « en attente » : role=super_admin,
     * agency_id=null (le couple qu'`assertIsCooptationInvitation` exige).
     */
    private function cooptationInvitation(User $inviter, array $attributes = []): Invitation
    {
        return Invitation::factory()->create(array_merge([
            'email' => 'coopte@example.com',
            'invited_by' => $inviter->id,
            'agency_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDays(7),
            'metadata' => ['requires_2fa' => true],
        ], $attributes));
    }

    // ---------------------------------------------------------------
    // AC1 / AC2 — relance
    // ---------------------------------------------------------------

    public function test_resend_reemits_the_existing_invitation_without_creating_a_second_one(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor, ['expires_at' => now()->addDay()]);

        $tokenAvant = $invitation->getRawOriginal('token');
        $expirationAvant = $invitation->expires_at->copy();

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")
            ->assertStatus(200)
            ->assertJsonPath('data.id', $invitation->id)
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.is_expired', false);

        // AC2 — AUCUNE seconde ligne. Le compte porte sur l'email, pas sur
        // la table entière : c'est la duplication d'invitation que la
        // contrainte interdit, pas l'existence d'autres invitations.
        $this->assertSame(
            1,
            Invitation::query()->where('email', 'coopte@example.com')->count(),
        );

        $invitation->refresh();
        // AC2 — l'expiration a bien été REPOUSSÉE, et le token réémis.
        $this->assertTrue($invitation->expires_at->greaterThan($expirationAvant));
        $this->assertNotSame($tokenAvant, $invitation->getRawOriginal('token'));
        $this->assertNull($invitation->last_reminded_at);
    }

    public function test_resend_sends_the_invitation_email_again(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")
            ->assertStatus(200);

        Mail::assertSent(InvitationMailable::class, 1);
    }

    // ---------------------------------------------------------------
    // AC1 — annulation
    // ---------------------------------------------------------------

    public function test_revoke_flips_the_invitation_to_revoked_and_drops_it_from_the_listing(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/revoke")
            ->assertStatus(200)
            ->assertJsonPath('data.status', InvitationStatus::Revoked->value);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Revoked, $invitation->status);
        $this->assertNotNull($invitation->revoked_at);

        $listing = $this->getJson('/api/admin/super-admins')->assertStatus(200);
        $ids = collect($listing->json('data.pending_invitations'))->pluck('id')->all();
        $this->assertNotContains($invitation->id, $ids);
    }

    public function test_revoking_an_accepted_invitation_is_refused(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor, [
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
        ]);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/revoke")
            ->assertStatus(422);
    }

    /**
     * Contrainte « aucune action ne doit permettre de rester sans aucun
     * super-admin actif ». Elle est structurellement tenue : l'annulation
     * ne touche qu'une invitation NON acceptée, donc l'ensemble des actifs
     * est invariant. Ce test fige l'invariant plutôt que de le supposer.
     */
    public function test_revoking_an_invitation_leaves_the_active_super_admins_untouched(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor);

        $avant = $this->getJson('/api/admin/super-admins')->json('data.super_admins');

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/revoke")
            ->assertStatus(200);

        $apres = $this->getJson('/api/admin/super-admins')->json('data.super_admins');
        $this->assertSame(
            collect($avant)->pluck('id')->sort()->values()->all(),
            collect($apres)->pluck('id')->sort()->values()->all(),
        );
        $this->assertNotEmpty($apres);
    }

    // ---------------------------------------------------------------
    // AC3 — expiration visible
    // ---------------------------------------------------------------

    public function test_listing_exposes_expiration_and_flags_a_past_due_invitation_as_expired(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');

        // Le cron `invitations:expire` n'est pas passé : status encore
        // `sent`, expires_at déjà dépassé. C'est le cas que `status` seul
        // ne sait pas dire.
        $perimee = $this->cooptationInvitation($actor, [
            'email' => 'perimee@example.com',
            'expires_at' => now()->subHour(),
        ]);
        // Le cron est passé.
        $marquee = $this->cooptationInvitation($actor, [
            'email' => 'marquee@example.com',
            'status' => InvitationStatus::Expired->value,
            'expires_at' => now()->subDays(3),
        ]);
        $valide = $this->cooptationInvitation($actor, [
            'email' => 'valide@example.com',
            'expires_at' => now()->addDays(5),
        ]);

        $rows = collect(
            $this->getJson('/api/admin/super-admins')->assertStatus(200)->json('data.pending_invitations')
        )->keyBy('id');

        $this->assertTrue($rows[$perimee->id]['is_expired']);
        $this->assertSame(InvitationStatus::Sent->value, $rows[$perimee->id]['status']);
        $this->assertTrue($rows[$marquee->id]['is_expired']);
        $this->assertFalse($rows[$valide->id]['is_expired']);
        $this->assertNotNull($rows[$valide->id]['expires_at']);
    }

    public function test_listing_exposes_last_login_of_active_super_admins(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $actor->forceFill(['last_login_at' => now()->subDays(2)])->save();

        $row = collect($this->getJson('/api/admin/super-admins')->json('data.super_admins'))
            ->firstWhere('id', $actor->id);

        $this->assertNotNull($row);
        $this->assertNotNull($row['last_login_at']);
    }

    public function test_an_expired_invitation_can_be_relaunched_without_creating_a_second_row(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor, [
            'status' => InvitationStatus::Expired->value,
            'expires_at' => now()->subDays(3),
        ]);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")
            ->assertStatus(200)
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.is_expired', false);

        $this->assertSame(
            1,
            Invitation::query()->where('email', 'coopte@example.com')->count(),
        );
        $invitation->refresh();
        $this->assertTrue($invitation->expires_at->isFuture());
    }

    // ---------------------------------------------------------------
    // AC4 — autorisation
    // ---------------------------------------------------------------

    public function test_a_non_super_admin_is_refused_by_the_api_on_resend_and_revoke(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = User::factory()->create();
        $this->materializeRoleProfile($inviter, 'super_admin');
        $invitation = $this->cooptationInvitation($inviter);

        $this->actingAsRole('agency_admin');

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")
            ->assertStatus(403);
        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/revoke")
            ->assertStatus(403);

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Sent, $invitation->status);
    }

    public function test_an_unauthenticated_caller_is_refused(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = User::factory()->create();
        $this->materializeRoleProfile($inviter, 'super_admin');
        $invitation = $this->cooptationInvitation($inviter);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")
            ->assertStatus(401);
    }

    /**
     * La surface de cooptation ne doit pas devenir une porte dérobée sur
     * les invitations d'agence : 404, pas 403 (cf. le docblock du service).
     */
    public function test_an_agency_invitation_is_not_reachable_through_the_cooptation_surface(): void
    {
        Mail::fake();
        Notification::fake();
        $this->actingAsRole('super_admin');
        $agencyInvitation = Invitation::factory()->create(['role' => 'agent']);

        $this->postJson("/api/admin/super-admins/invitations/{$agencyInvitation->id}/resend")
            ->assertStatus(404);
        $this->postJson("/api/admin/super-admins/invitations/{$agencyInvitation->id}/revoke")
            ->assertStatus(404);
    }

    // ---------------------------------------------------------------
    // AC5 — journal d'audit
    // ---------------------------------------------------------------

    public function test_resend_and_revoke_are_written_to_the_audit_log(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $aRelancer = $this->cooptationInvitation($actor, ['email' => 'relance@example.com']);
        $aAnnuler = $this->cooptationInvitation($actor, ['email' => 'annule@example.com']);

        $this->postJson("/api/admin/super-admins/invitations/{$aRelancer->id}/resend")->assertStatus(200);
        $this->postJson("/api/admin/super-admins/invitations/{$aAnnuler->id}/revoke")->assertStatus(200);

        $this->assertDatabaseHas('activity_log', [
            'event' => 'super_admin_invitation_resent',
            'subject_type' => Invitation::class,
            'subject_id' => $aRelancer->id,
            'causer_id' => $actor->id,
        ]);
        $this->assertDatabaseHas('activity_log', [
            'event' => 'super_admin_invitation_revoked',
            'subject_type' => Invitation::class,
            'subject_id' => $aAnnuler->id,
            'causer_id' => $actor->id,
        ]);

        // Et elles sont LISIBLES depuis la console d'audit cross-tenant,
        // ce qui est le sens réel de « apparaissent dans le journal ».
        $events = collect($this->getJson('/api/admin/audit')->json('data'))->pluck('event')->all();
        $this->assertContains('super_admin_invitation_resent', $events);
        $this->assertContains('super_admin_invitation_revoked', $events);
    }

    // ---------------------------------------------------------------
    // Non-régression : la 2FA reste bloquante
    // ---------------------------------------------------------------

    public function test_resend_does_not_weaken_the_blocking_2fa_rule(): void
    {
        Mail::fake();
        Notification::fake();
        $actor = $this->actingAsRole('super_admin');
        $invitation = $this->cooptationInvitation($actor, ['email' => 'nouveau@example.com']);

        $this->postJson("/api/admin/super-admins/invitations/{$invitation->id}/resend")->assertStatus(200);

        // Le destinataire accepte avec le token RELANCÉ.
        $token = $invitation->fresh()->getRawOriginal('token');
        $this->postJson("/api/invitations/{$token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'password' => 'MotDePasse!2026',
        ])->assertStatus(200);

        $nouveau = User::query()->where('email', 'nouveau@example.com')->firstOrFail();
        // Toujours PAS super-admin : l'enrôlement TOTP reste le seul
        // passage. Une relance ne raccourcit rien.
        $this->assertFalse($nouveau->isSuperAdmin());
        $this->assertTrue((bool) $nouveau->force_2fa_at_first_login);
    }
}
