<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationExpiredNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-249 — AC5 (expire cron), AC6 (remind cron), revoke + resend.
 */
class InvitationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_expire_command_flips_stale_sent_invitations(): void
    {
        Notification::fake();

        $stale = Invitation::factory()->expired()->create();
        $active = Invitation::factory()->create([
            'expires_at' => now()->addDays(5),
            'status' => InvitationStatus::Sent->value,
        ]);

        $this->artisan('invitations:expire')->assertSuccessful();

        $this->assertSame(InvitationStatus::Expired, $stale->fresh()->status);
        $this->assertSame(InvitationStatus::Sent, $active->fresh()->status);
    }

    public function test_expire_notifies_inviter(): void
    {
        Notification::fake();
        $inviter = User::factory()->create();
        Invitation::factory()->expired()->create(['invited_by' => $inviter->id]);

        $this->artisan('invitations:expire')->assertSuccessful();

        Notification::assertSentTo($inviter, InvitationExpiredNotification::class);
    }

    public function test_remind_command_emails_pending_invitations_after_2_days(): void
    {
        Mail::fake();
        $eligible = Invitation::factory()->create([
            'created_at' => now()->subDays(3),
            'expires_at' => now()->addDays(4),
            'status' => InvitationStatus::Sent->value,
            'last_reminded_at' => null,
        ]);
        $tooFresh = Invitation::factory()->create([
            'created_at' => now()->subDay(),
            'expires_at' => now()->addDays(6),
            'status' => InvitationStatus::Sent->value,
            'last_reminded_at' => null,
        ]);

        $this->artisan('invitations:remind')->assertSuccessful();

        Mail::assertSent(InvitationMailable::class, function (InvitationMailable $mail) use ($eligible) {
            return $mail->hasTo($eligible->email) && $mail->isReminder === true;
        });
        Mail::assertNotSent(InvitationMailable::class, function (InvitationMailable $mail) use ($tooFresh) {
            return $mail->hasTo($tooFresh->email);
        });

        $this->assertNotNull($eligible->fresh()->last_reminded_at);
    }

    public function test_remind_command_is_idempotent(): void
    {
        Mail::fake();
        $invitation = Invitation::factory()->create([
            'created_at' => now()->subDays(3),
            'expires_at' => now()->addDays(4),
            'status' => InvitationStatus::Sent->value,
            'last_reminded_at' => now()->subHour(),
        ]);

        $this->artisan('invitations:remind')->assertSuccessful();
        Mail::assertNothingSent();
    }

    public function test_inviter_can_revoke_pending_invitation(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
        ]);

        $this->postJson("/api/invitations/{$invitation->id}/revoke")
            ->assertStatus(200)
            ->assertJsonPath('data.status', InvitationStatus::Revoked->value);

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);

        $log = Activity::query()->where('event', 'invitation_revoked')->first();
        $this->assertNotNull($log);
    }

    public function test_revoke_accepted_invitation_returns_422(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->accepted()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
        ]);

        $this->postJson("/api/invitations/{$invitation->id}/revoke")
            ->assertStatus(422);
    }

    public function test_resend_regenerates_token_and_pushes_expiry(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
            'last_reminded_at' => now()->subHour(),
        ]);
        $oldToken = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertStatus(200);

        $invitation->refresh();
        $this->assertNotSame($oldToken, $invitation->token);
        $this->assertTrue($invitation->expires_at->greaterThan(now()->addDays(6)));
        $this->assertNull($invitation->last_reminded_at);

        Mail::assertSent(InvitationMailable::class);
    }

    public function test_resend_on_revoked_invitation_returns_422(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->revoked()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
        ]);

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertStatus(422);
    }
}
