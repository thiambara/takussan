<?php

namespace Tests\Feature\Notifications;

use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Task;
use App\Models\User;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification as BaseNotification;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-1794 (P142.02) — la bienvenue du locataire, le rappel de tâche, les deux rappels d'état des
 * lieux et la relance de facture sont marqués envoyés dès leur mise en file. Quand le worker
 * abandonne l'envoi d'un canal, l'échec final écrit l'activité alertable `ops_critical_job_failed`
 * (la notification, le canal, l'objet de l'envoi) : la marque dit « parti », l'alerte dit le
 * contraire, et l'exploitation est prévenue dès le premier.
 */
class EnvoisMarquesEnEchecTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{Closure(): array{BaseNotification, Model}}> */
    public static function envois(): array
    {
        return [
            'bienvenue du locataire' => [function (): array {
                $lease = Lease::factory()->create();

                return [new TenantWelcomeNotification($lease), $lease];
            }],
            'rappel de tâche' => [function (): array {
                $task = Task::factory()->create();

                return [new TaskDueReminderNotification($task), $task];
            }],
            'rappel d\'état des lieux au locataire' => [function (): array {
                $lease = Lease::factory()->create();

                return [new TenantInventoryReminderNotification($lease), $lease];
            }],
            'rappel d\'état des lieux à l\'agence' => [function (): array {
                $lease = Lease::factory()->create();

                return [new AgentTenantInventoryReminderNotification($lease), $lease];
            }],
            'relance de facture' => [function (): array {
                $invoice = Invoice::factory()->create();

                return [new InvoiceOverdueReminderNotification($invoice, 7), $invoice];
            }],
        ];
    }

    /** @param  Closure(): array{BaseNotification, Model}  $fabrique */
    #[DataProvider('envois')]
    public function test_l_abandon_de_l_e_mail_ecrit_une_activite_alertable(Closure $fabrique): void
    {
        [$notification, $sujet] = $fabrique();
        $destinataire = User::factory()->create(['email' => 'destinataire@example.test']);
        Queue::fake();

        Notification::send($destinataire, $notification);

        $envoi = Queue::pushed(SendQueuedNotifications::class)
            ->first(fn (SendQueuedNotifications $job): bool => $job->channels === ['mail']);
        $this->assertNotNull($envoi, 'la copie e-mail doit partir en file');

        Log::spy();
        unserialize(serialize($envoi))->failed(new RuntimeException('refus pour destinataire@example.test'));

        Log::shouldHaveReceived('error')->once()->withArgs(fn (string $message, array $context): bool => $message === '[notifications] envoi abandonné'
            && $context['notification'] === $notification::class);
        $activity = Activity::query()->where('event', 'ops_critical_job_failed')->sole();
        $this->assertSame(class_basename($notification), $activity->properties['job']);
        $this->assertSame('mail', $activity->properties['channel']);
        $this->assertSame(RuntimeException::class, $activity->properties['exception']);
        $this->assertSame($sujet->getMorphClass(), $activity->subject_type);
        $this->assertEquals($sujet->getKey(), $activity->subject_id);
        $this->assertStringNotContainsString('destinataire@example.test', json_encode($activity->properties->all()));
    }
}
