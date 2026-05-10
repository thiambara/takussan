<?php

namespace App\Notifications;

use App\Models\Lease;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
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
 * Channels defer to {@see PreferenceResolver}: in-app is always on,
 * email respects the user's preferences (defaults to on when no row
 * exists). Idempotence is enforced upstream by the listener via the
 * `tenant_welcomed_at` sentinel on the lease itself.
 */
class TenantWelcomeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'tenant_welcomed';

    public const KIND = 'tenant_welcome';

    public function __construct(public Lease $lease) {}

    /**
     * @return list<string>
     */
    public function via(object $notifiable): array
    {
        $resolver = app(PreferenceResolver::class);
        $channels = [];

        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_INAPP)) {
            $channels[] = 'database';
        }
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_EMAIL)) {
            $channels[] = 'mail';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $reference = $this->lease->reference_number ?? '#'.$this->lease->id;
        $url = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').'/app';

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
