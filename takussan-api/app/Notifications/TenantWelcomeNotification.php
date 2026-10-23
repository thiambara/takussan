<?php

namespace App\Notifications;

use App\Models\Lease;
use App\Notifications\Concerns\AlertsWhenMarkedDeliveryFails;
use App\Support\LienFront;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-265 — Sent to a tenant once their lease has been activated.
 *
 * One-shot welcome message: in-app feed + email by default. The hand-off
 * to the on-screen welcome modale (TCK-251) happens client-side via the
 * `tenant-welcome-{lease_id}` welcome key — this notification only owns
 * the *outbound* surface (centre de notifications + boîte mail).
 *
 * TCK-1193 (P75.02) — envoi transactionnel unique, non désactivable : cloche et e-mail
 * partent toujours. L'événement `tenant_welcomed` que `via()` passait au résolveur n'avait
 * aucun interrupteur (absent de `PreferenceResolver::EVENTS`) : ce docblock disait que l'e-mail
 * obéissait aux préférences, et rien ne le coupait. Idempotence is enforced upstream by the
 * listener via the `tenant_welcomed_at` sentinel on the lease itself.
 */
class TenantWelcomeNotification extends Notification implements ShouldQueue
{
    use AlertsWhenMarkedDeliveryFails;
    use Queueable;

    public const KIND = 'tenant_welcome';

    public function __construct(public Lease $lease) {}

    /** TCK-1794 (P142.02) — l'objet que l'alerte d'un envoi abandonné désigne. */
    protected function sujetDeLEnvoi(): ?Model
    {
        return $this->lease;
    }

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->lease->reference_number ?? '#'.$this->lease->id;
        $url = LienFront::base().'/app';

        return (new MailMessage)
            ->subject(__('notifications.tenant_welcome.subject', ['reference' => $reference]))
            ->greeting(__('notifications.tenant_welcome.greeting'))
            ->line(__('notifications.tenant_welcome.intro', ['reference' => $reference]))
            ->line(__('notifications.tenant_welcome.body'))
            ->action(__('notifications.tenant_welcome.action'), $url)
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(object $notifiable): array
    {
        $reference = $this->lease->reference_number ?? '#'.$this->lease->id;

        return [
            'lease_id' => $this->lease->id,
            'kind' => self::KIND,
            'reference_number' => $this->lease->reference_number,
            'title' => __('notifications.tenant_welcome.subject', ['reference' => $reference]),
            'body' => __('notifications.tenant_welcome.intro', ['reference' => $reference]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'tenant.welcomed';
    }
}
