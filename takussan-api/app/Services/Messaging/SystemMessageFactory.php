<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;

/**
 * TCK-085 — Builds the immutable system messages that surface inside a
 * group conversation thread when a participant is added / removed,
 * promoted / demoted, or the conversation is renamed.
 *
 * Stored as `Message.type = system` with `metadata.event` ∈
 *  - participant_added
 *  - participant_removed
 *  - role_changed
 *  - renamed
 *
 * `sender_id` is null for system messages — these have no human author.
 * The frontend renders them inline as neutral lines (see
 * `<SystemMessageBubble>`).
 */
class SystemMessageFactory
{
    public const EVENT_PARTICIPANT_ADDED = 'participant_added';

    public const EVENT_PARTICIPANT_REMOVED = 'participant_removed';

    public const EVENT_ROLE_CHANGED = 'role_changed';

    public const EVENT_RENAMED = 'renamed';

    public const EVENTS = [
        self::EVENT_PARTICIPANT_ADDED,
        self::EVENT_PARTICIPANT_REMOVED,
        self::EVENT_ROLE_CHANGED,
        self::EVENT_RENAMED,
    ];

    public function participantAdded(Conversation $conversation, User $actor, User $target): Message
    {
        return $this->emit($conversation, self::EVENT_PARTICIPANT_ADDED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
        ]);
    }

    public function participantRemoved(Conversation $conversation, ?User $actor, User $target): Message
    {
        return $this->emit($conversation, self::EVENT_PARTICIPANT_REMOVED, [
            'actor_id' => $actor?->id,
            'actor_name' => $actor ? $this->displayName($actor) : null,
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
            // self-leave is a participant_removed where actor === target
            'self_leave' => $actor && $actor->id === $target->id,
        ]);
    }

    public function roleChanged(Conversation $conversation, User $actor, User $target, string $role): Message
    {
        return $this->emit($conversation, self::EVENT_ROLE_CHANGED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'target_id' => $target->id,
            'target_name' => $this->displayName($target),
            'role' => $role,
        ]);
    }

    public function renamed(Conversation $conversation, User $actor, ?string $oldSubject, ?string $newSubject): Message
    {
        return $this->emit($conversation, self::EVENT_RENAMED, [
            'actor_id' => $actor->id,
            'actor_name' => $this->displayName($actor),
            'old_subject' => $oldSubject,
            'new_subject' => $newSubject,
        ]);
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    protected function emit(Conversation $conversation, string $event, array $metadata): Message
    {
        return Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => null,
            'type' => MessageType::System->value,
            'content' => $this->humanise($event, $metadata),
            'metadata' => array_merge(['event' => $event], $metadata),
        ]);
    }

    /**
     * Plain-text fallback rendered server-side. The frontend overrides
     * this with locale-aware text from `messaging.system.*`, but the API
     * still ships a sensible default for non-rich consumers.
     *
     * @param  array<string, mixed>  $m
     */
    protected function humanise(string $event, array $m): string
    {
        return match ($event) {
            self::EVENT_PARTICIPANT_ADDED => sprintf(
                '%s a ajouté %s au groupe',
                $m['actor_name'] ?? '—',
                $m['target_name'] ?? '—',
            ),
            self::EVENT_PARTICIPANT_REMOVED => ($m['self_leave'] ?? false)
                ? sprintf('%s a quitté le groupe', $m['target_name'] ?? '—')
                : sprintf('%s a retiré %s du groupe', $m['actor_name'] ?? '—', $m['target_name'] ?? '—'),
            self::EVENT_ROLE_CHANGED => sprintf(
                '%s a changé le rôle de %s en %s',
                $m['actor_name'] ?? '—',
                $m['target_name'] ?? '—',
                $m['role'] ?? '—',
            ),
            self::EVENT_RENAMED => sprintf(
                '%s a renommé le groupe en « %s »',
                $m['actor_name'] ?? '—',
                $m['new_subject'] ?? '—',
            ),
            default => $event,
        };
    }

    protected function displayName(User $user): string
    {
        $full = trim(($user->first_name ?? '').' '.($user->last_name ?? ''));

        return $full !== '' ? $full : ($user->email ?? '#'.$user->id);
    }
}
