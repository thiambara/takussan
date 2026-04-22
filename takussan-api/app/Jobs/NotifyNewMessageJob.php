<?php

namespace App\Jobs;

use App\Models\Enums\NotificationType;
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
        $recipients = $message->conversation->participants()
            ->where('users.id', '!=', $message->sender_id)
            ->get();

        if ($recipients->isEmpty()) {
            return;
        }

        $senderName = $sender
            ? trim(($sender->first_name ?? '').' '.($sender->last_name ?? '')) ?: ($sender->email ?? 'Un contact')
            : 'Un contact';

        $notifications->notifyMany(
            $recipients,
            NotificationType::Message,
            'Nouveau message',
            $senderName.': '.mb_strimwidth((string) $message->content, 0, 80, '…'),
            [
                'conversation_id' => $message->conversation_id,
                'message_id' => $message->id,
            ],
        );
    }
}
