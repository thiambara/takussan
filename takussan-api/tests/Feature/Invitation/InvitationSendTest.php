<?php

namespace Tests\Feature\Invitation;

use App\Mail\InvitationMailable;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-249 — AC1, AC4, AC7 (send/dedup/activity log).
 *
 * P208.01 (TCK-2190) — la route générique `POST /api/invitations` est retirée : ces tests
 * éprouvent `InvitationService::send()`, que traversent les routes par rôle et la cooptation.
 * L'autorisation de chaque route par rôle se teste avec elle (`InviteAgentTest`…), et le retrait
 * de la route dans `CreationGeneriqueRetireeTest`.
 */
class InvitationSendTest extends TestCase
{
    use RefreshDatabase;

    private function envoyer(array $payload, User $inviter): Invitation
    {
        return app(InvitationService::class)->send($payload, $inviter);
    }

    public function test_an_invitation_is_created_and_email_is_sent(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        // TCK-455 — le couple (rôle, profil visé) est EXIGÉ : une invitation qui ne rattache à
        // rien produisait un compte accepté membre de rien.
        $profil = OwnerProfile::factory()->create(['agency_id' => $admin->agency_id]);

        $invitation = $this->envoyer([
            'email' => 'NewOwner@example.com',
            'role' => 'owner',
            'agency_id' => $admin->agency_id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

        $this->assertSame('newowner@example.com', $invitation->email);
        $this->assertSame(InvitationStatus::Sent, $invitation->status);

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
        $profil = AgentProfile::factory()->create(['agency_id' => $admin->agency_id, 'user_id' => null]);

        $invitation = $this->envoyer([
            'email' => 'existing@example.com',
            'role' => 'agent',
            'agency_id' => $admin->agency_id,
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

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
        try {
            $this->envoyer([
                'email' => 'dup@example.com',
                'role' => 'owner',
                'agency_id' => $admin->agency_id,
                'invitable_type' => OwnerProfile::class,
                'invitable_id' => $owner->id,
            ], $admin);
            $this->fail('Le doublon devait rendre 409.');
        } catch (HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }

        $this->assertSame(1, Invitation::query()->where('email', 'dup@example.com')->count());
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

        $profil = OwnerProfile::factory()->create(['agency_id' => $admin->agency_id]);

        $invitation = $this->envoyer([
            'email' => 'revoked@example.com',
            'role' => 'owner',
            'agency_id' => $admin->agency_id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

        $this->assertSame(InvitationStatus::Sent, $invitation->status);
    }

    public function test_activity_log_records_invitation_sent(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        $profil = OwnerProfile::factory()->create(['agency_id' => $admin->agency_id]);

        $this->envoyer([
            'email' => 'log@example.com',
            'role' => 'owner',
            'agency_id' => $admin->agency_id,
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $profil->id,
        ], $admin);

        $activity = Activity::query()->where('event', 'invitation_sent')->first();
        $this->assertNotNull($activity);
        $this->assertSame($admin->id, $activity->causer_id);
    }
}
