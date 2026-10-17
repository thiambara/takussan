<?php

namespace App\Notifications;

use App\Services\Admin\AgencyProvisioningService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-781 (P15.07, P13.09) — « Activez votre compte », envoyé au gérant qu'un super-admin
 * provisionne ({@see AgencyProvisioningService}). Le jeton vient du jeu `activations`
 * (7 jours, TCK-209), et non de celui de la réinitialisation (60 minutes) : le gérant n'a rien
 * demandé, le gabarit « si vous n'avez pas demandé de réinitialisation… » ne lui disait rien de
 * juste.
 *
 * Le lien mène à la page de réinitialisation avec `activation=1` : elle envoie ce drapeau à
 * `POST /api/auth/reset-password`, puis mène à `/onboarding/agency-admin` après la connexion.
 */
class AgencyAdminActivationNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(public readonly string $token) {}

    /** Comme les autres e-mails du compte (TCK-747) : la file urgente, hors de la requête. */
    public function viaQueues(): array
    {
        return ['mail' => 'notifications-urgent'];
    }

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontend = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/');
        $url = $frontend.'/auth/reset-password?token='.$this->token
            .'&email='.urlencode($notifiable->getEmailForPasswordReset())
            .'&activation=1';

        $jours = intdiv((int) config('auth.passwords.activations.expire'), 60 * 24);

        return (new MailMessage)
            ->subject(__('notifications.agency_admin_activation.subject'))
            ->greeting(__('notifications.agency_admin_activation.greeting'))
            ->line(__('notifications.agency_admin_activation.intro'))
            ->action(__('notifications.agency_admin_activation.action'), $url)
            ->line(__('notifications.agency_admin_activation.expire', ['count' => $jours]))
            ->salutation(__('notifications.salutation'));
    }
}
