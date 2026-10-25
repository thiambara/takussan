<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * P229.04 (TCK-2227) — `account:execute-deletions` lit les demandes à rappeler en lot, puis
 * envoyait le rappel sur chaque modèle chargé : une demande annulée pendant son passage recevait
 * quand même le rappel, qui annonce un effacement qui n'aura plus lieu.
 *
 * L'annulation est jouée une fois, dans l'écouteur `retrieved` du modèle, après la lecture du lot.
 */
class RappelDeSuppressionApresAnnulationTest extends TestCase
{
    use RefreshDatabase;

    private function demandeARappeler(User $user): AccountDeletionRequest
    {
        $user->forceFill(['deletion_requested_at' => now()->subDays(24)])->save();

        return AccountDeletionRequest::factory()->for($user)->create([
            'requested_at' => now()->subDays(24),
            'scheduled_for' => now()->addDays(5),
            'reminder_sent_at' => null,
        ]);
    }

    public function test_une_demande_annulee_pendant_le_passage_ne_recoit_pas_de_rappel(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $request = $this->demandeARappeler($user);

        $joue = false;
        AccountDeletionRequest::retrieved(function () use (&$joue, $user): void {
            if ($joue) {
                return;
            }
            $joue = true;
            $this->assertTrue(app(AccountDeletionService::class)->cancelDeletion($user->fresh()));
        });

        $this->artisan('account:execute-deletions')
            ->expectsOutputToContain('reminders=0')
            ->assertExitCode(0);

        $this->assertNull(AccountDeletionRequest::query()->find($request->id));
        Notification::assertNotSentTo($user, AccountDeletionReminderNotification::class);
    }

    public function test_un_rappel_deja_pose_pendant_le_passage_ne_repart_pas(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $request = $this->demandeARappeler($user);

        $joue = false;
        AccountDeletionRequest::retrieved(function () use (&$joue, $request): void {
            if ($joue) {
                return;
            }
            $joue = true;
            // Un passage concurrent a déjà posé le rappel.
            AccountDeletionRequest::query()->whereKey($request->id)->update(['reminder_sent_at' => now()]);
        });

        $this->artisan('account:execute-deletions')->assertExitCode(0);

        Notification::assertNotSentTo($user, AccountDeletionReminderNotification::class);
    }

    public function test_sans_annulation_le_rappel_part_et_se_marque(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $request = $this->demandeARappeler($user);

        $this->artisan('account:execute-deletions')
            ->expectsOutputToContain('reminders=1')
            ->assertExitCode(0);

        Notification::assertSentTo($user, AccountDeletionReminderNotification::class);
        $this->assertNotNull($request->fresh()->reminder_sent_at);
    }
}
