<?php

namespace App\Observers;

use App\Models\Enums\MessageType;
use App\Models\Message;
use Symfony\Component\HttpKernel\Exception\HttpException;

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

    /**
     * TCK-085 — Block updates on system messages. The audit trail must
     * be tamper-proof; even an admin can't rewrite "Alice added Bob".
     */
    public function updating(Message $message): void
    {
        $original = $message->getOriginal('type');
        $isSystem = $original === MessageType::System->value
            || $original === MessageType::System;

        if (! $isSystem) {
            return;
        }

        // Allow no-op saves (e.g. metadata refresh) but reject content
        // edits and type changes.
        $changed = array_keys($message->getDirty());
        $allowed = ['updated_at']; // pure timestamp touches
        if (! empty(array_diff($changed, $allowed))) {
            throw new HttpException(403, __('messaging.errors.system_message_immutable'));
        }
    }

    /**
     * TCK-085 — System messages cannot be deleted (soft or hard).
     */
    public function deleting(Message $message): void
    {
        $type = $message->type;
        $isSystem = $type === MessageType::System
            || (is_object($type) && method_exists($type, 'value') && $type->value === 'system');

        if ($isSystem) {
            throw new HttpException(403, __('messaging.errors.system_message_immutable'));
        }
    }
}
