<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\InvitationStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Invitation;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PragmaRX\Google2FA\Google2FA;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0047 §4) — la cooptation est le SEUL chemin d'octroi d'un `PlatformProfile`.
 *
 * AC12 : `PUT /api/users/{id}/role {role: super_admin}` ne crée, ne réactive ni ne promeut rien.
 * AC13 : une cooptation au niveau `support` produit un profil `support`, `granted_by_id` = l'inviteur.
 * Second chemin : la confirmation de la 2FA du coopté n'octroie rien sans invitation acceptée.
 */
class SuperAdminGrantOnlyByCooptationTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_la_route_de_role_ne_cree_aucun_profil(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $cible = User::factory()->create();

        $this->putJson("/api/users/{$cible->id}/role", ['role' => 'super_admin'])->assertStatus(422);

        $this->assertSame(0, PlatformProfile::query()->where('user_id', $cible->id)->count());
    }

    public function test_la_route_de_role_ne_reactive_pas_un_profil_revoque(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $revoque = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $revokedAt = now()->subDay()->startOfSecond();
        $revoque->platformProfile->forceFill(['revoked_at' => $revokedAt])->save();

        $this->putJson("/api/users/{$revoque->id}/role", ['role' => 'super_admin'])->assertStatus(422);

        $this->assertTrue($revokedAt->equalTo($revoque->platformProfile()->first()->revoked_at));
    }

    public function test_la_route_de_role_ne_promeut_pas_un_support(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $support = $this->operateur(PlatformProfileLevel::Support);

        $this->putJson("/api/users/{$support->id}/role", ['role' => 'super_admin'])->assertStatus(422);

        $this->assertSame(PlatformProfileLevel::Support, $support->platformProfile()->first()->level);
    }

    /** AC13 — de l'invitation à la confirmation de la 2FA, par les routes. */
    public function test_une_cooptation_au_niveau_support_produit_un_profil_support(): void
    {
        Mail::fake();
        Notification::fake();
        $inviteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->postJson('/api/admin/super-admins/invite', [
            'email' => 'awa.support@example.com',
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'level' => 'support',
        ])->assertCreated();
        $invitation = Invitation::query()->where('email', 'awa.support@example.com')->sole();
        $this->assertSame('support', $invitation->metadata['level']);

        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'password' => 'sup3r-secret-Awa',
        ])->assertOk();
        $coopte = User::query()->where('email', 'awa.support@example.com')->sole();
        $this->assertFalse($coopte->hasActivePlatformProfile(), 'Rien avant la 2FA.');

        $this->confirmerLaDeuxiemeEtape($coopte)->assertOk();

        $profil = $coopte->platformProfile()->first();
        $this->assertSame(PlatformProfileLevel::Support, $profil->level);
        $this->assertSame($inviteur->id, (int) $profil->granted_by_id);
        $this->assertNull($profil->revoked_at);
        $this->assertFalse($coopte->fresh()->isSuperAdmin());
    }

    public function test_sans_niveau_l_invitation_coopte_un_super_admin(): void
    {
        Mail::fake();
        Notification::fake();
        $inviteur = $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $coopte = User::factory()->create(['force_2fa_at_first_login' => true]);
        $this->invitationAcceptee($coopte, $inviteur, []);

        $this->confirmerLaDeuxiemeEtape($coopte)->assertOk();

        $this->assertTrue($coopte->fresh()->isSuperAdmin());
    }

    /** Second chemin : le drapeau `force_2fa_at_first_login` seul ne vaut pas invitation. */
    public function test_la_confirmation_de_la_2fa_n_octroie_rien_sans_invitation_acceptee(): void
    {
        Notification::fake();
        $inviteur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $candidat = User::factory()->create(['force_2fa_at_first_login' => true]);
        // Une invitation ENVOYÉE (non acceptée), et une acceptée par un AUTRE compte.
        $this->invitationAcceptee(User::factory()->create(), $inviteur, ['level' => 'super_admin']);
        Invitation::factory()->create([
            'email' => $candidat->email, 'invited_by' => $inviteur->id, 'agency_id' => null,
            'invitable_type' => null, 'invitable_id' => null, 'role' => 'super_admin',
            'status' => InvitationStatus::Sent->value, 'metadata' => ['level' => 'super_admin'],
        ]);

        $this->confirmerLaDeuxiemeEtape($candidat)
            ->assertForbidden()
            ->assertJsonPath('code', 'super_admin.not_pending');

        $this->assertSame(0, PlatformProfile::query()->where('user_id', $candidat->id)->count());
        $this->assertFalse((bool) $candidat->fresh()->two_factor_enabled, 'La transaction est rejouée en arrière.');
    }

    private function invitationAcceptee(User $coopte, User $inviteur, array $metadata): Invitation
    {
        return Invitation::factory()->create([
            'email' => $coopte->email,
            'invited_by' => $inviteur->id,
            'invited_user_id' => $coopte->id,
            'agency_id' => null,
            'invitable_type' => null,
            'invitable_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
            'metadata' => $metadata + ['requires_2fa' => true],
        ]);
    }

    private function confirmerLaDeuxiemeEtape(User $coopte)
    {
        $secret = app(TwoFactorService::class)->generateSecret();
        $coopte->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => json_encode([]),
            'two_factor_enabled' => false,
            'force_2fa_at_first_login' => true,
        ])->save();

        $this->app['auth']->forgetGuards();
        $this->actingAs($coopte->fresh());

        return $this->postJson('/api/auth/super-admin/2fa/confirm', ['code' => (new Google2FA)->getCurrentOtp($secret)]);
    }
}
