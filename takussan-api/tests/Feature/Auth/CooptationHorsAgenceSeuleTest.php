<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Invitation;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * P208.03 (TCK-2190) — la défense derrière le retrait de la création générique (décision du
 * porteur du 2026-10-24) : l'acceptation ne pose le drapeau d'enrôlement 2FA que pour une
 * cooptation SANS agence, et `enroll` ne coupe pas une 2FA active tant qu'aucune cooptation
 * acceptée n'existe.
 *
 * Avant : une invitation `super_admin` rattachée à une agence (émise par le générique) posait
 * `force_2fa_at_first_login` à l'acceptation ; `enroll` remplaçait le secret et coupait la 2FA,
 * puis `confirm` rendait 403 faute de cooptation sans agence : le compte restait sans 2FA et
 * renvoyé sur l'enrôlement.
 */
class CooptationHorsAgenceSeuleTest extends ApiTestCase
{
    use RefreshDatabase;

    private function invitationSuperAdmin(User $invitant, ?int $agencyId, string $email): Invitation
    {
        return Invitation::factory()->create([
            'email' => $email,
            'invited_by' => $invitant->id,
            'agency_id' => $agencyId,
            'invitable_type' => null,
            'invitable_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Sent->value,
        ]);
    }

    public function test_une_invitation_super_admin_rattachee_a_une_agence_ne_pose_pas_le_drapeau(): void
    {
        Mail::fake();
        Notification::fake();
        $admin = User::factory()->create();
        $compte = User::factory()->withTwoFactor()->create(['email' => 'compte@example.com']);
        $invitation = $this->invitationSuperAdmin($admin, Agency::factory()->create()->id, $compte->email);

        $this->actingAsApi($compte)
            ->postJson("/api/invitations/{$invitation->token}/accept")
            ->assertOk();

        $this->assertFalse((bool) $compte->fresh()->force_2fa_at_first_login);
        $this->assertTrue((bool) $compte->fresh()->two_factor_enabled);
        $this->assertFalse($compte->fresh()->isSuperAdmin());
    }

    public function test_temoin_la_cooptation_sans_agence_pose_toujours_le_drapeau(): void
    {
        Mail::fake();
        Notification::fake();
        $operateur = User::factory()->create();
        $compte = User::factory()->withTwoFactor()->create(['email' => 'coopte@example.com']);
        $invitation = $this->invitationSuperAdmin($operateur, null, $compte->email);

        $this->actingAsApi($compte)
            ->postJson("/api/invitations/{$invitation->token}/accept")
            ->assertOk();

        $this->assertTrue((bool) $compte->fresh()->force_2fa_at_first_login);
    }

    public function test_enroll_ne_coupe_pas_une_2fa_active_sans_cooptation_acceptee(): void
    {
        $compte = User::factory()->withTwoFactor()->create(['force_2fa_at_first_login' => true]);
        $secret = $compte->two_factor_secret;

        $this->actingAsApi($compte)
            ->postJson('/api/auth/super-admin/2fa/enroll')
            ->assertStatus(403)
            ->assertJsonPath('code', 'super_admin.not_pending');

        $this->assertTrue((bool) $compte->fresh()->two_factor_enabled);
        $this->assertSame($secret, $compte->fresh()->two_factor_secret);
    }

    public function test_temoin_enroll_reste_ouvert_au_compte_a_2fa_coopte_sans_agence(): void
    {
        $operateur = User::factory()->create();
        $compte = User::factory()->withTwoFactor()->create(['force_2fa_at_first_login' => true]);
        $this->invitationSuperAdmin($operateur, null, (string) $compte->email)->forceFill([
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'invited_user_id' => $compte->id,
        ])->save();

        $this->actingAsApi($compte)->postJson('/api/auth/super-admin/2fa/enroll')->assertOk();
    }

    public function test_temoin_enroll_reste_ouvert_a_l_operateur_amorce(): void
    {
        // `SuperAdminBootstrapService` pose 2FA active, drapeau et profil plateforme, sans
        // cooptation : son enrôlement au premier passage ne doit pas tomber.
        $compte = User::factory()->withTwoFactor()->create(['force_2fa_at_first_login' => true]);
        PlatformProfile::query()->create([
            'user_id' => $compte->id,
            'level' => PlatformProfileLevel::SuperAdmin,
            'granted_at' => now(),
        ]);

        $this->actingAsApi($compte)->postJson('/api/auth/super-admin/2fa/enroll')->assertOk();
    }

    public function test_temoin_enroll_reste_ouvert_sans_2fa(): void
    {
        $compte = User::factory()->create(['force_2fa_at_first_login' => true, 'two_factor_enabled' => false]);

        $this->actingAsApi($compte)->postJson('/api/auth/super-admin/2fa/enroll')->assertOk();
    }
}
