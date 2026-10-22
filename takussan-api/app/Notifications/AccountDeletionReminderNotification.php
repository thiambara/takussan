<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use App\Notifications\Concerns\RetriesWithBackoff;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-080 — J-N reminder (default J-7) before irreversible deletion.
 */
class AccountDeletionReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use RetriesWithBackoff;

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
