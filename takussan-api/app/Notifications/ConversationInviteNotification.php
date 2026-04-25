<?php

namespace App\Notifications;

use App\Models\Conversation;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * TCK-085 — Notifies a user that they have just been added to a group
 * conversation. Respects {@see PreferenceResolver} for per-channel
 * fan-out (inapp always on, email/push gated).
 *
 * Note: muting is *per-participant* and stored on
 * `ConversationParticipant.is_muted` — but mute applies to *new
 * messages*, not to the invite itself. A freshly-added participant is by
 * definition not yet muted, so we don't gate the invite on that flag.
 */
class ConversationInviteNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public const EVENT_TYPE = 'message_received';

    public function __construct(
        public Conversation $conversation,
        public ?User $inviter = null,
    ) {}

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
        if ($resolver->shouldSend($notifiable, self::EVENT_TYPE, PreferenceResolver::CHANNEL_PUSH)) {
            $channels[] = 'broadcast';
        }

        return $channels;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $title = $this->conversation->subject ?? '#'.$this->conversation->id;

        return (new MailMessage)
            ->subject(__('notifications.conversation_invite.subject', ['subject' => $title]))
            ->greeting(__('notifications.conversation_invite.greeting'))
            ->line(__('notifications.conversation_invite.intro', [
                'inviter' => $this->displayInviter(),
                'subject' => $title,
            ]))
            ->salutation(__('notifications.salutation'));
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'conversation_id' => $this->conversation->id,
            'subject' => $this->conversation->subject,
            'inviter_id' => $this->inviter?->id,
            'inviter_name' => $this->displayInviter(),
            'title' => __('notifications.conversation_invite.subject', [
                'subject' => $this->conversation->subject ?? '#'.$this->conversation->id,
            ]),
        ];
    }

    public function toBroadcast(object $notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function broadcastType(): string
    {
        return 'conversation.invite';
    }

    protected function displayInviter(): string
    {
        if (! $this->inviter) {
            return '—';
        }
        $full = trim(($this->inviter->first_name ?? '').' '.($this->inviter->last_name ?? ''));

        return $full !== '' ? $full : ($this->inviter->email ?? '—');
    }
}
