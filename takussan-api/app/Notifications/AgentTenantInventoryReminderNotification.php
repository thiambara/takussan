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
 * TCK-266 — Pendant agent du rappel J+7 EDL : envoyé à l'agent assigné
 * (ou à défaut au primary admin de l'agence) pour qu'il relance le
 * locataire si l'EDL n'est toujours pas signé.
 */
class AgentTenantInventoryReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'tenant_inventory_reminder';

    public const KIND = 'agent_tenant_inventory_reminder';

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
        $url = rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/')
            .'/app/leases/onboarding-pending';

        $tenantName = trim(
            ($this->lease->tenant?->first_name ?? '').' '.($this->lease->tenant?->last_name ?? '')
        );
        if ($tenantName === '') {
            $tenantName = __('notifications.agent_tenant_inventory_reminder.unknown_tenant');
        }

        return (new MailMessage)
            ->subject(__('notifications.agent_tenant_inventory_reminder.subject', ['reference' => $reference]))
            ->greeting(__('notifications.agent_tenant_inventory_reminder.greeting'))
            ->line(__('notifications.agent_tenant_inventory_reminder.intro', [
                'reference' => $reference,
                'tenant' => $tenantName,
            ]))
            ->line(__('notifications.agent_tenant_inventory_reminder.body'))
            ->action(__('notifications.agent_tenant_inventory_reminder.action'), $url)
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
            'title' => __('notifications.agent_tenant_inventory_reminder.subject', ['reference' => $reference]),
            'body' => __('notifications.agent_tenant_inventory_reminder.intro', [
                'reference' => $reference,
                'tenant' => trim(
                    ($this->lease->tenant?->first_name ?? '').' '.($this->lease->tenant?->last_name ?? '')
                ) ?: __('notifications.agent_tenant_inventory_reminder.unknown_tenant'),
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'agent.tenant.inventory.reminder';
    }
}
