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
 * TCK-266 — J+7 reminder envoyé au locataire dont l'EDL d'entrée n'est
 * toujours pas signé. Idempotence : le cron horaire enregistre l'envoi
 * dans `tenant_onboarding_checklists.reminders_sent` et ne re-fire pas.
 */
class TenantInventoryReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'tenant_inventory_reminder';

    public const KIND = 'tenant_inventory_reminder';

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
        $url = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').'/app/inventories';

        return (new MailMessage)
            ->subject(__('notifications.tenant_inventory_reminder.subject', ['reference' => $reference]))
            ->greeting(__('notifications.tenant_inventory_reminder.greeting'))
            ->line(__('notifications.tenant_inventory_reminder.intro', ['reference' => $reference]))
            ->line(__('notifications.tenant_inventory_reminder.body'))
            ->action(__('notifications.tenant_inventory_reminder.action'), $url)
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
            'title' => __('notifications.tenant_inventory_reminder.subject', ['reference' => $reference]),
            'body' => __('notifications.tenant_inventory_reminder.intro', ['reference' => $reference]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'tenant.inventory.reminder';
    }
}
