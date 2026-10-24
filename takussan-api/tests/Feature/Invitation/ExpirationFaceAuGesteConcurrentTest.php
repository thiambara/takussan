<?php

namespace Tests\Feature\Invitation;

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\InvitationExpiredNotification;
use App\Services\Invitation\InvitationService;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * P229.01, P229.02 (TCK-2223) — `invitations:expire` lit ses invitations en lot, puis écrivait
 * `expired` sur le modèle chargé, sans relire la ligne : une relance, une révocation ou une
 * acceptation jouée pendant son passage était écrasée, et l'invitant recevait un avis
 * d'expiration. `revoke()` jugeait de même sur le modèle lié, et repassait en `revoked` une
 * invitation acceptée entre-temps.
 *
 * Le geste concurrent est joué une fois, dans l'écouteur `retrieved` du modèle : la tâche a déjà
 * lu ses lignes, le geste passe sur une copie fraîche, puis la tâche continue sur sa copie.
 */
class ExpirationFaceAuGesteConcurrentTest extends TestCase
{
    use RefreshDatabase;

    private function pendantLaLecture(Closure $geste): void
    {
        $joue = false;
        Invitation::retrieved(function () use (&$joue, $geste): void {
            if ($joue) {
                return;
            }
            $joue = true;
            $geste();
        });
    }

    private function invitationEchue(User $inviter): Invitation
    {
        return Invitation::factory()->create([
            'invited_by' => $inviter->id,
            'agency_id' => $inviter->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->subHour(),
        ]);
    }

    public function test_une_relance_pendant_le_passage_n_est_pas_expiree(): void
    {
        Notification::fake();
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = $this->invitationEchue($admin);

        $this->pendantLaLecture(function () use ($invitation, $admin): void {
            app(InvitationService::class)->resend(Invitation::query()->findOrFail($invitation->id), $admin);
        });

        $expirees = app(InvitationService::class)->expire();

        $fraiche = $invitation->fresh();
        $this->assertSame(InvitationStatus::Sent, $fraiche->status);
        $this->assertTrue($fraiche->expires_at->isFuture());
        $this->assertCount(0, $expirees);
        Notification::assertNotSentTo($admin, InvitationExpiredNotification::class);
        $this->assertSame(0, Activity::query()->where('event', 'invitation_expired')->count());
    }

    public function test_une_revocation_pendant_le_passage_reste_revoquee(): void
    {
        Notification::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = $this->invitationEchue($admin);

        $this->pendantLaLecture(function () use ($invitation, $admin): void {
            app(InvitationService::class)->revoke(Invitation::query()->findOrFail($invitation->id), $admin);
        });

        app(InvitationService::class)->expire();

        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
        Notification::assertNotSentTo($admin, InvitationExpiredNotification::class);
    }

    public function test_une_acceptation_pendant_le_passage_reste_acceptee(): void
    {
        Notification::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = $this->invitationEchue($admin);

        $this->pendantLaLecture(function () use ($invitation): void {
            DB::table('invitations')->where('id', $invitation->id)->update([
                'status' => InvitationStatus::Accepted->value,
                'accepted_at' => now(),
            ]);
        });

        app(InvitationService::class)->expire();

        $this->assertSame(InvitationStatus::Accepted, $invitation->fresh()->status);
        Notification::assertNotSentTo($admin, InvitationExpiredNotification::class);
    }

    public function test_l_expiration_sans_geste_concurrent_reste_ecrite_et_annoncee(): void
    {
        Notification::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = $this->invitationEchue($admin);

        $expirees = app(InvitationService::class)->expire();

        $this->assertSame(InvitationStatus::Expired, $invitation->fresh()->status);
        $this->assertCount(1, $expirees);
        Notification::assertSentTo($admin, InvitationExpiredNotification::class);
        $this->assertSame(1, Activity::query()->where('event', 'invitation_expired')->count());
    }

    public function test_revoquer_sur_un_modele_perime_une_invitation_acceptee_entre_temps_est_refuse(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDays(3),
        ]);
        // Le modèle lié reste `sent` ; la ligne est acceptée entre-temps.
        DB::table('invitations')->where('id', $invitation->id)->update([
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
        ]);

        try {
            app(InvitationService::class)->revoke($invitation, $admin);
            $this->fail('La révocation d’une invitation acceptée entre-temps aurait dû être refusée.');
        } catch (ValidationException $e) {
            $this->assertSame(422, $e->status);
        }

        $fraiche = $invitation->fresh();
        $this->assertSame(InvitationStatus::Accepted, $fraiche->status);
        $this->assertNull($fraiche->revoked_at);
        $this->assertSame(0, Activity::query()->where('event', 'invitation_revoked')->count());
    }
}
