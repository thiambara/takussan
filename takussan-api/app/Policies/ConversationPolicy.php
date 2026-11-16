<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;

/**
 * TCK-085 — Permissions on group conversations.
 *
 * Most actions require the actor to be an *active* admin of the group
 * (admin role + `left_at = null`). The `super_admin` role bypasses
 * everything via the global `Gate::before` hook in AppServiceProvider.
 */
class ConversationPolicy
{
    /**
     * P191.03 (TCK-2023) — l'acteur doit d'abord avoir accès au fil ({@see ConversationAccess::allows}) :
     * un agent suspendu, resté administrateur d'un groupe de bail, y ajoutait un tiers qui lisait
     * alors tout l'historique.
     */
    public function addParticipant(User $user, Conversation $conversation): bool
    {
        return app(ConversationAccess::class)->allows($user, $conversation)
            && $this->isActiveAdmin($user, $conversation);
    }

    /**
     * TCK-2859 (ADR-0114 § 3) — faire entrer quelqu'un dans un fil DIRECT : cela crée un groupe neuf
     * (sans l'historique), que l'appelant administre. Il faut pouvoir ÉCRIRE dans la directe
     * (`ConversationAccess::allowsWriting`) : qui la lit sans y écrire n'en ouvre pas de groupe.
     */
    public function addToDirect(User $user, Conversation $conversation): bool
    {
        return $conversation->type === ConversationType::Direct
            && app(ConversationAccess::class)->allowsWriting($user, $conversation);
    }

    /**
     * TCK-2859 (ADR-0114 § 2) — signaler le fil : un participant ACTIF, que la garde de lecture
     * accepte. Appelée directement par `ReportConversationRequest`, hors `Gate` : le `Gate::before`
     * du super-admin le laisserait signaler un fil dont il n'est pas partie.
     */
    public function report(User $user, Conversation $conversation): bool
    {
        return $conversation->participants()
            ->where('users.id', $user->id)
            ->wherePivotNull('left_at')
            ->exists()
            && app(ConversationAccess::class)->allows($user, $conversation);
    }

    public function removeParticipant(User $user, Conversation $conversation, User $target): bool
    {
        // TCK-861 (P38.07) — seul un groupe se quitte : une directe « quittée » restait ouverte à
        // l'autre partie, qui y écrivait sans que le parti en soit jamais notifié.
        if ($conversation->type !== ConversationType::Group) {
            return false;
        }

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
        // TCK-592 (verif-592, B2) — la même garde que la lecture et l'écriture.
        return app(ConversationAccess::class)->allows($user, $conversation);
    }
}
