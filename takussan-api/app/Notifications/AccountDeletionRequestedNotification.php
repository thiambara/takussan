<?php

namespace App\Notifications;

use App\Models\AccountDeletionRequest;
use App\Notifications\Channels\SmsChannel;
use App\Notifications\Concerns\RepliSmsSansEmail;
use App\Notifications\Concerns\RetriesWithBackoff;
use App\Notifications\Concerns\SupportsSms;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Queue\Attributes\DeleteWhenMissingModels;

/**
 * TCK-080 — confirms a user's deletion request, gives the effective date,
 * and points at the cancellation route ("changed your mind?").
 *
 * TCK-1750 (P166.01) — `#[DeleteWhenMissingModels]` : `cancelDeletion` supprime la demande pour de
 * bon ; annulée avant le passage du worker, l'avis n'a plus d'objet et sort de la file sans échec
 * (il levait `ModelNotFoundException` et laissait une ligne `failed_jobs`).
 *
 * TCK-2051 (P193.04) — hors préférences (`MobileClassEventsTest::HORS_PREFERENCES`) : le SMS n'est
 * qu'un repli pour un compte sans e-mail, critique (`isCriticalSms()`), que `SmsChannel` envoie sans
 * lire la matrice. Lui ouvrir une case ouvrirait une case qui ne commande rien.
 */
#[DeleteWhenMissingModels]
class AccountDeletionRequestedNotification extends Notification implements ShouldQueue, SupportsSms
{
    use Queueable;
    use RepliSmsSansEmail;
    use RetriesWithBackoff;

    /** TCK-747 (P11.04) — les avis du compte partent par la file urgente, hors de la requête ; le SMS d'un compte sans e-mail aussi (TCK-2051). */
    public function viaQueues(): array
    {
        return ['mail' => 'notifications-urgent', SmsChannel::class => 'notifications-urgent'];
    }

    public function __construct(public readonly AccountDeletionRequest $request) {}

    public function toMail(object $notifiable): MailMessage
    {
        $scheduledFor = $this->request->scheduled_for?->format('d/m/Y') ?? '';
        $cancelUrl = LienFront::vers('/app/profile');

        return (new MailMessage)
            ->subject(__('notifications.account_deletion_requested.subject'))
            ->greeting(__('notifications.account_deletion_requested.greeting'))
            ->line(__('notifications.account_deletion_requested.intro', ['date' => $scheduledFor]))
            ->line(__('notifications.account_deletion_requested.consequences'))
            ->action(__('notifications.account_deletion_requested.action'), $cancelUrl)
            ->line(__('notifications.account_deletion_requested.ignore'))
            ->salutation(__('notifications.salutation'));
    }

    /** P193.04 (TCK-2051) — un compte sans e-mail : SMS au numéro vérifié. */
    public function toSms(object $notifiable): string
    {
        return __('notifications.account_deletion_requested.sms', ['date' => $this->request->scheduled_for?->format('d/m/Y') ?? '']);
    }
}
