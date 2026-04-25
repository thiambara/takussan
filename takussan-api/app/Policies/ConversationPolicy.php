<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;

/**
 * TCK-085 — Permissions on group conversations.
 *
 * Most actions require the actor to be an *active* admin of the group
 * (admin role + `left_at = null`). The `super_admin` role bypasses
 * everything via the global `Gate::before` hook in AppServiceProvider.
 */
class ConversationPolicy
{
    public function addParticipant(User $user, Conversation $conversation): bool
    {
        return $this->isActiveAdmin($user, $conversation);
    }

    public function removeParticipant(User $user, Conversation $conversation, User $target): bool
    {
        // Self-leave is allowed for any active participant.
        if ($user->id === $target->id) {
            return $this->isActiveParticipant($user, $conversation);
        }

        return $this->isActiveAdmin($user, $conversation);
    }

    public function promote(User $user, Conversation $conversation): bool
    {
        return $this->isActiveAdmin($user, $conversation);
    }

    public function rename(User $user, Conversation $conversation): bool
    {
        return $this->isActiveAdmin($user, $conversation);
    }

    /**
     * `is_muted` is per-participant — any active participant can toggle
     * it for themselves.
     */
    public function toggleMute(User $user, Conversation $conversation): bool
    {
        return $this->isActiveParticipant($user, $conversation);
    }

    /**
     * System messages are immutable. Even an admin cannot edit/delete
     * them — this guards against silent rewriting of the audit trail.
     */
    public function modifyMessage(User $user, Message $message): bool
    {
        return $message->type !== MessageType::System
            && $message->type?->value !== 'system';
    }

    protected function isActiveAdmin(User $user, Conversation $conversation): bool
    {
        if ($conversation->type !== ConversationType::Group) {
            return false;
        }

        return $conversation->participants()
            ->where('users.id', $user->id)
            ->wherePivot('role', ParticipantRole::Admin->value)
            ->wherePivotNull('left_at')
            ->exists();
    }

    protected function isActiveParticipant(User $user, Conversation $conversation): bool
    {
        return $conversation->participants()
            ->where('users.id', $user->id)
            ->wherePivotNull('left_at')
            ->exists();
    }
}
