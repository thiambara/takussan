<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use App\Notifications\Concerns\RetriesWithBackoff;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Throwable;

/**
 * TCK-080 — J-N reminder (default J-7) before irreversible deletion.
 *
 * TCK-1390 (P142.03) — `account:execute-deletions` marque le rappel envoyé dès sa mise en file.
 * Si le worker abandonne l'envoi, {@see failed()} remet `reminder_sent_at` à nul, pour que le
 * passage suivant le renvoie, et reporte la suppression du temps écoulé depuis la marque : sans
 * cela, le compte était supprimé à `scheduled_for` sans que son titulaire ait été prévenu.
 */
class AccountDeletionReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use RetriesWithBackoff {
        failed as journaliserEchec;
    }

    /** TCK-747 (P11.04) — les e-mails du compte partent par la file urgente, hors de la requête. */
    public function viaQueues(): array
    {
        return ['mail' => 'notifications-urgent'];
    }

    public function __construct(public readonly AccountDeletionRequest $request) {}

    /** @return array<int,string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function failed(?Throwable $e): void
    {
        $this->journaliserEchec($e);

        $request = $this->request->fresh();
        if ($request === null || $request->executed_at !== null || $request->reminder_sent_at === null) {
            return;
        }

        $retard = (int) max(0, $request->reminder_sent_at->diffInSeconds(now(), false));

        $request->forceFill([
            'reminder_sent_at' => null,
            'scheduled_for' => $request->scheduled_for?->copy()->addSeconds($retard),
        ])->save();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $scheduledFor = $this->request->scheduled_for?->format('d/m/Y') ?? '';
        $daysRemaining = (string) max(0, $this->request->daysRemaining());
        $cancelUrl = LienFront::vers('/app/profile');

        return (new MailMessage)
            ->subject(__('notifications.account_deletion_reminder.subject', ['days' => $daysRemaining]))
            ->greeting(__('notifications.account_deletion_reminder.greeting'))
            ->line(__('notifications.account_deletion_reminder.intro', [
                'days' => $daysRemaining,
                'date' => $scheduledFor,
            ]))
            ->action(__('notifications.account_deletion_reminder.action'), $cancelUrl)
            ->line(__('notifications.account_deletion_reminder.ignore'))
            ->salutation(__('notifications.salutation'));
    }
}
