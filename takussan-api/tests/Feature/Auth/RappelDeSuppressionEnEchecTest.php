<?php

namespace Tests\Feature\Auth;

use App\Models\AccountDeletionRequest;
use App\Models\User;
use App\Notifications\AccountDeletionReminderNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\SendQueuedNotifications;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-1390 (P142.03) — le rappel J-7 est marqué envoyé dès sa mise en file. Quand le worker
 * abandonne l'envoi, `failed()` remet `reminder_sent_at` à nul (le passage suivant le renvoie) et
 * reporte la suppression du temps perdu : le compte n'est plus supprimé sans rappel.
 */
class RappelDeSuppressionEnEchecTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_rappel_abandonne_repart_et_la_suppression_est_reportee_d_autant(): void
    {
        $this->travelTo(now()->startOfMinute());
        $user = User::factory()->create();
        $prevue = now()->addDays(6)->startOfMinute();
        $request = AccountDeletionRequest::factory()->for($user)->create([
            'scheduled_for' => $prevue,
            'reminder_sent_at' => now(),
        ]);

        $this->travel(25)->minutes();
        $job = unserialize(serialize(new SendQueuedNotifications(
            $user,
            new AccountDeletionReminderNotification($request),
            ['mail'],
        )));
        $job->failed(new RuntimeException('SMTP refusé'));

        $request->refresh();
        $this->assertNull($request->reminder_sent_at);
        $this->assertTrue($request->scheduled_for->equalTo($prevue->copy()->addMinutes(25)));
        $this->assertTrue(
            app(AccountDeletionService::class)->dueForReminder()->contains('id', $request->id),
            'le passage suivant doit renvoyer le rappel',
        );
    }

    public function test_une_suppression_deja_executee_n_est_pas_touchee(): void
    {
        $user = User::factory()->create();
        $request = AccountDeletionRequest::factory()->for($user)->create([
            'scheduled_for' => now()->subHour(),
            'reminder_sent_at' => now()->subDays(7),
            'executed_at' => now()->subMinutes(5),
        ]);
        $avant = $request->fresh();

        (new AccountDeletionReminderNotification($request))->failed(new RuntimeException('SMTP refusé'));

        $request->refresh();
        $this->assertTrue($request->reminder_sent_at->equalTo($avant->reminder_sent_at));
        $this->assertTrue($request->scheduled_for->equalTo($avant->scheduled_for));
    }
}
