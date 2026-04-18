<?php

namespace App\Observers;

use App\Models\Message;

class MessageObserver
{
    public function created(Message $message): void
    {
        $preview = mb_strimwidth(strip_tags((string) $message->content), 0, 120, '…');

        $message->conversation()->update([
            'last_message_id' => $message->id,
            'last_message_preview' => $preview,
            'last_message_at' => $message->created_at,
        ]);
    }
}
