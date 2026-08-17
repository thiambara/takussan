<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-249 — AC1, AC4, AC7 (send/dedup/activity log).
 */
class InvitationSendTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_admin_can_create_invitation_and_email_is_sent(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        $response = $this->postJson('/api/invitations', [
            'email' => 'NewOwner@example.com',
            'role' => 'owner',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.email', 'newowner@example.com')
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.status', InvitationStatus::Sent->value);

        $this->assertDatabaseHas('invitations', [
            'email' => 'newowner@example.com',
            'role' => 'owner',
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
        ]);

        Mail::assertSent(InvitationMailable::class, function (InvitationMailable $mail) {
            return $mail->hasTo('newowner@example.com');
        });
    }

    public function test_invitation_links_existing_user_via_invited_user_id(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $existing = User::factory()->create(['email' => 'existing@example.com']);

        $this->postJson('/api/invitations', [
            'email' => 'existing@example.com',
            'role' => 'agent',
        ])->assertStatus(201);

        $invitation = Invitation::query()->where('email', 'existing@example.com')->first();
        $this->assertNotNull($invitation);
        $this->assertSame($existing->id, $invitation->invited_user_id);
    }

    public function test_duplicate_pending_invitation_returns_409(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        Invitation::factory()->create([
            'email' => 'dup@example.com',
            'invitable_type' => OwnerProfile::class,
            'agency_id' => $admin->agency_id,
            'invited_by' => $admin->id,
            'status' => InvitationStatus::Sent->value,
        ]);

        $owner = OwnerProfile::factory()->create(['agency_id' => $admin->agency_id]);

        // Same (email, invitable_type, agency_id) → 409.
        $this->postJson('/api/invitations', [
            'email' => 'dup@example.com',
            'role' => 'owner',
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $owner->id,
        ])->assertStatus(409);
    }

    public function test_revoked_pending_does_not_block_resend_of_new_invitation(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        Invitation::factory()->revoked()->create([
            'email' => 'revoked@example.com',
            'invitable_type' => null,
            'agency_id' => $admin->agency_id,
            'invited_by' => $admin->id,
        ]);

        $this->postJson('/api/invitations', [
            'email' => 'revoked@example.com',
            'role' => 'owner',
        ])->assertStatus(201);
    }

    public function test_activity_log_records_invitation_sent(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        $this->postJson('/api/invitations', [
            'email' => 'log@example.com',
            'role' => 'owner',
        ])->assertStatus(201);

        $activity = Activity::query()->where('event', 'invitation_sent')->first();
        $this->assertNotNull($activity);
        $this->assertSame($admin->id, $activity->causer_id);
    }

    public function test_non_admin_user_cannot_create_invitation(): void
    {
        $this->actingAsRole('agent');
        $this->postJson('/api/invitations', [
            'email' => 'test@example.com',
            'role' => 'owner',
        ])->assertStatus(403);
    }

    public function test_super_admin_can_invite_cross_agency(): void
    {
        Mail::fake();
        $superAdmin = $this->actingAsRole('super_admin');
        $otherAgency = Agency::factory()->create();

        $this->postJson('/api/invitations', [
            'email' => 'cross@example.com',
            'role' => 'agency_admin',
            'agency_id' => $otherAgency->id,
        ])->assertStatus(201);

        $this->assertDatabaseHas('invitations', [
            'email' => 'cross@example.com',
            'agency_id' => $otherAgency->id,
        ]);
    }

    public function test_invalid_role_is_rejected(): void
    {
        $this->actingAsRole('agency_admin');
        $this->postJson('/api/invitations', [
            'email' => 'test@example.com',
            'role' => 'tenant', // not in the invitation whitelist
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);
    }
}
