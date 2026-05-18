<?php

namespace Tests\Feature\Auth;

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Services\Auth\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use PragmaRX\Google2FA\Google2FA;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\PermissionRegistrar;
use Tests\BaseTestCase;

/**
 * TCK-264 — Peer-to-peer super-admin cooptation with mandatory 2FA.
 *
 * Covers:
 *  - AC1: a super-admin invites a new super-admin → invitation created,
 *    other super-admins notified.
 *  - AC2: the invited user, post-acceptance, holds NO super_admin role
 *    yet — only `force_2fa_at_first_login = true`.
 *  - AC3: 2FA enroll returns secret + recovery codes (codes hashed in DB);
 *    confirm with valid code attaches the spatie role and broadcasts to
 *    every other super-admin.
 *  - AC4 / AC5: activity log entries (super_admin_invited,
 *    super_admin_2fa_enrolled, super_admin_role_attached).
 *  - AC6: a non-super-admin caller is bounced with 403.
 *  - Listing endpoint surfaces both active and pending entries.
 *  - Invalid TOTP code keeps the spatie role detached.
 */
class SuperAdminCooptationTest extends BaseTestCase
{
    use RefreshDatabase;

    private function pinSuperAdminTeam(): void
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
    }

    public function test_super_admin_can_invite_another_super_admin(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = $this->actingAsRole('super_admin');
        // A second existing super-admin to receive the broadcast.
        $peer = User::factory()->create();
        $this->pinSuperAdminTeam();
        $peer->assignRole('super_admin');
        $this->materializeRoleProfile($peer, 'super_admin');

        $response = $this->postJson('/api/admin/super-admins/invite', [
            'email' => 'NewAdmin@example.com',
            'first_name' => 'Coura',
            'last_name' => 'Sow',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newadmin@example.com')
            ->assertJsonPath('data.role', 'super_admin')
            ->assertJsonPath('data.agency_id', null)
            ->assertJsonPath('data.status', InvitationStatus::Sent->value);

        $invitation = Invitation::query()->where('email', 'newadmin@example.com')->firstOrFail();
        $this->assertSame('super_admin', $invitation->role);
        $this->assertNull($invitation->agency_id);
        $this->assertTrue((bool) data_get($invitation->metadata, 'requires_2fa'));

        Notification::assertSentTo([$peer], SuperAdminInvitedBroadcast::class);
        Notification::assertNotSentTo([$inviter], SuperAdminInvitedBroadcast::class);

        $this->assertDatabaseHas('activity_log', [
            'event' => 'super_admin_invited',
            'subject_type' => Invitation::class,
            'subject_id' => $invitation->id,
        ]);
    }

    public function test_non_super_admin_cannot_invite(): void
    {
        Mail::fake();
        $this->actingAsRole('agency_admin');

        $this->postJson('/api/admin/super-admins/invite', [
            'email' => 'rogue@example.com',
            'first_name' => 'X',
            'last_name' => 'Y',
        ])->assertStatus(403);
    }

    public function test_acceptance_creates_user_without_attaching_role_and_sets_force_2fa_flag(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = $this->actingAsRole('super_admin');

        $invitation = Invitation::factory()->create([
            'email' => 'pending@example.com',
            'invited_by' => $inviter->id,
            'agency_id' => null,
            'invitable_type' => null,
            'invitable_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Sent->value,
            'metadata' => ['requires_2fa' => true, 'first_name' => 'Pen', 'last_name' => 'Ding'],
        ]);

        $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'first_name' => 'Pen',
            'last_name' => 'Ding',
            'password' => 'sup3r-secret',
        ])->assertStatus(200);

        $created = User::query()->where('email', 'pending@example.com')->firstOrFail();
        $this->assertTrue((bool) $created->force_2fa_at_first_login);
        $this->assertFalse($created->isSuperAdmin(), 'role must be deferred until 2FA enroll');

        $invitation->refresh();
        $this->assertSame(InvitationStatus::Accepted, $invitation->status);

        $this->assertDatabaseHas('activity_log', [
            'event' => 'super_admin_role_pending',
        ]);
    }

    public function test_two_factor_enroll_returns_secret_and_recovery_codes_hashed(): void
    {
        $user = User::factory()->create([
            'force_2fa_at_first_login' => true,
        ]);
        $this->actingAs($user);

        $response = $this->postJson('/api/auth/super-admin/2fa/enroll');
        $response->assertStatus(200)
            ->assertJsonStructure(['data' => ['secret', 'qr_url', 'qr_svg', 'recovery_codes']]);

        $codes = $response->json('data.recovery_codes');
        $this->assertCount(8, $codes);

        $user->refresh();
        $stored = json_decode($user->two_factor_recovery_codes, true);
        $this->assertIsArray($stored);
        $this->assertCount(8, $stored);
        // Stored codes must be hashes, not the plain codes.
        foreach ($codes as $i => $plain) {
            $this->assertNotSame($plain, $stored[$i]);
            $this->assertTrue(Hash::check($plain, $stored[$i]));
        }
    }

    public function test_two_factor_confirm_attaches_role_and_clears_force_flag(): void
    {
        Notification::fake();
        $this->ensureRolesSeeded();
        // A peer super-admin to receive the broadcast.
        $peer = User::factory()->create();
        $this->pinSuperAdminTeam();
        $peer->assignRole('super_admin');
        $this->materializeRoleProfile($peer, 'super_admin');

        $candidate = User::factory()->create([
            'force_2fa_at_first_login' => true,
        ]);

        $totp = app(TwoFactorService::class);
        $secret = $totp->generateSecret();
        $candidate->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => json_encode([]),
            'two_factor_enabled' => false,
        ])->save();

        $code = (new Google2FA)->getCurrentOtp($secret);

        $this->actingAs($candidate->fresh());

        $this->postJson('/api/auth/super-admin/2fa/confirm', ['code' => $code])
            ->assertStatus(200)
            ->assertJsonPath('data.role_attached', true);

        $candidate->refresh();
        $this->assertTrue((bool) $candidate->two_factor_enabled);
        $this->assertFalse((bool) $candidate->force_2fa_at_first_login);
        $this->assertTrue($candidate->isSuperAdmin());

        Notification::assertSentTo([$peer], SuperAdminAcceptedBroadcast::class);

        $this->assertDatabaseHas('activity_log', ['event' => 'super_admin_2fa_enrolled']);
        $this->assertDatabaseHas('activity_log', ['event' => 'super_admin_role_attached']);
    }

    public function test_two_factor_confirm_with_invalid_code_does_not_attach_role(): void
    {
        $candidate = User::factory()->create([
            'force_2fa_at_first_login' => true,
        ]);
        $totp = app(TwoFactorService::class);
        $secret = $totp->generateSecret();
        $candidate->forceFill([
            'two_factor_secret' => $secret,
            'two_factor_enabled' => false,
        ])->save();

        $this->actingAs($candidate->fresh());

        $this->postJson('/api/auth/super-admin/2fa/confirm', ['code' => '000000'])
            ->assertStatus(422);

        $candidate->refresh();
        $this->assertFalse((bool) $candidate->two_factor_enabled);
        $this->assertTrue((bool) $candidate->force_2fa_at_first_login);
        $this->assertFalse($candidate->isSuperAdmin());
    }

    public function test_super_admin_listing_returns_active_and_pending(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = $this->actingAsRole('super_admin');

        // Pending invitation.
        Invitation::factory()->create([
            'email' => 'pending@example.com',
            'invited_by' => $inviter->id,
            'agency_id' => null,
            'role' => 'super_admin',
            'status' => InvitationStatus::Sent->value,
        ]);

        $response = $this->getJson('/api/admin/super-admins');
        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'super_admins' => [['id', 'email', 'two_factor_enabled', 'force_2fa_at_first_login']],
                    'pending_invitations',
                ],
            ]);

        $emails = collect($response->json('data.super_admins'))->pluck('email')->all();
        $this->assertContains($inviter->email, $emails);

        $pending = $response->json('data.pending_invitations');
        $this->assertNotEmpty($pending);
        $this->assertSame('pending@example.com', $pending[0]['email']);
    }

    public function test_inviting_an_existing_super_admin_returns_409(): void
    {
        Mail::fake();
        Notification::fake();
        $inviter = $this->actingAsRole('super_admin');
        $existing = User::factory()->create(['email' => 'old@example.com']);
        $this->pinSuperAdminTeam();
        $existing->assignRole('super_admin');
        $this->materializeRoleProfile($existing, 'super_admin');

        $this->postJson('/api/admin/super-admins/invite', [
            'email' => 'old@example.com',
            'first_name' => 'Old',
            'last_name' => 'Hand',
        ])->assertStatus(409);
    }

    public function test_unauthenticated_2fa_enroll_is_rejected(): void
    {
        $this->postJson('/api/auth/super-admin/2fa/enroll')->assertStatus(401);
    }

    public function test_2fa_enroll_for_non_pending_user_returns_403(): void
    {
        $user = User::factory()->create([
            'force_2fa_at_first_login' => false,
        ]);
        $this->actingAs($user);

        $this->postJson('/api/auth/super-admin/2fa/enroll')->assertStatus(403);
    }
}
