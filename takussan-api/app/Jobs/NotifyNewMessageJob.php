<?php

namespace App\Jobs;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Message;
use App\Services\Model\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Notifies all participants of a conversation — except the sender —
 * that a new message has been posted. Dispatched asynchronously from
 * ConversationController::sendMessage so the HTTP response isn't
 * blocked by mail delivery or broadcasting.
 */
class NotifyNewMessageJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $messageId) {}

    public function handle(NotificationService $notifications): void
    {
        /** @var Message|null $message */
        $message = Message::with(['conversation.participants', 'sender'])->find($this->messageId);
        if (! $message || ! $message->conversation) {
            return;
        }

        $sender = $message->sender;
        // TCK-085 — Exclude:
        //   - the sender themselves
        //   - participants who muted this conversation (notif suppressed,
        //     message still persisted and visible in the thread)
        //   - participants who left the group (`left_at != null`)
        $recipients = $message->conversation->participants()
            ->when($message->sender_id !== null, fn ($q) => $q->where('users.id', '!=', $message->sender_id))
            ->wherePivot('is_muted', false)
            ->wherePivotNull('left_at')
            ->get();

        if ($recipients->isEmpty()) {
            return;
        }

        // TCK-588 — un expéditeur sans nom rend « — » dans la langue du destinataire, plutôt
        // qu'un « Un contact » français écrit ici.
        $senderName = $sender
            ? trim(($sender->first_name ?? '').' '.($sender->last_name ?? '')) ?: $sender->email
            : null;

        foreach ($recipients as $recipient) {
            $notifications->send($recipient, NotificationCode::MessageReceived, [
                'sender' => $senderName,
                'excerpt' => mb_strimwidth((string) $message->content, 0, 80, '…'),
            ], NotificationTarget::of('conversation', $message->conversation_id));
        }
    }
}
