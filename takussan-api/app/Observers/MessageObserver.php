<?php

namespace App\Observers;

use App\Models\Enums\MessageType;
use App\Models\Message;
use Symfony\Component\HttpKernel\Exception\HttpException;

class MessageObserver
{
    /**
     * TCK-2958 (ADR-0128 § 3) — l'aperçu commun de la liste. Pour un `system`, un `event` ou une
     * `card`, `content` est un CODE (`SystemMessageFactory`, `EvenementsDuFil`) : l'aperçu l'est
     * aussi, et le front compose le texte depuis `last_message.metadata`.
     */
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
     *
     * TCK-2958 (ADR-0128 § 3) — un `event` est immuable comme un `system`, et une `card` ne se
     * modifie pas non plus : son contenu est relu à l'affichage depuis l'objet, jamais réécrit.
     */
    public function updating(Message $message): void
    {
        $original = $message->getOriginal('type');
        $original = $original instanceof MessageType ? $original : MessageType::tryFrom((string) $original);

        if (! in_array($original, [MessageType::System, MessageType::Event, MessageType::Card], true)) {
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
     *
     * TCK-2958 — ni un `event`. Une `card` suit la règle d'un message de son auteur.
     */
    public function deleting(Message $message): void
    {
        $type = $message->type;
        $type = $type instanceof MessageType ? $type : MessageType::tryFrom((string) $type);

        if (in_array($type, [MessageType::System, MessageType::Event], true)) {
            throw new HttpException(403, __('messaging.errors.system_message_immutable'));
        }
    }
}
