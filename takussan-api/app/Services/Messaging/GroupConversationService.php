<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Notifications\ConversationInviteNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * TCK-085 — All write paths for a `type = group` Conversation.
 *
 * Goals:
 *  - Atomically grow / shrink / re-role the participant set.
 *  - Always emit a system message describing the change.
 *  - Refuse to leave the group adminless ("last admin" guard).
 *  - Send a `ConversationInviteNotification` to fresh participants.
 *
 * The controller (`ConversationController`, `ConversationParticipantController`)
 * is responsible for HTTP concerns (auth, validation, response shape) and
 * delegates the business rules here.
 */
class GroupConversationService
{
    public function __construct(
        private readonly SystemMessageFactory $systemMessages,
    ) {}

    /**
     * Create a brand-new group conversation. Creator becomes the sole
     * admin; every other user joins as `member`.
     *
     * @param  list<int>  $participantIds  Other users to invite. Creator must NOT be in this list (caller dedupes).
     */
    public function create(
        User $creator,
        string $subject,
        array $participantIds,
        ?int $propertyId = null,
        ?int $leaseId = null,
        ?int $maintenanceRequestId = null,
    ): Conversation {
        return DB::transaction(function () use (
            $creator,
            $subject,
            $participantIds,
            $propertyId,
            $leaseId,
            $maintenanceRequestId,
        ) {
            $conversation = Conversation::create([
                'subject' => $subject,
                'type' => ConversationType::Group->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $creator->id,
                'property_id' => $propertyId,
                'lease_id' => $leaseId,
                'maintenance_request_id' => $maintenanceRequestId,
            ]);

            // Creator → admin
            $conversation->participants()->attach($creator->id, [
                'role' => ParticipantRole::Admin->value,
                'joined_at' => now(),
            ]);

            // Others → member
            $unique = array_values(array_unique(array_filter(
                $participantIds,
                fn ($id) => (int) $id !== (int) $creator->id,
            )));

            foreach ($unique as $uid) {
                $conversation->participants()->attach($uid, [
                    'role' => ParticipantRole::Member->value,
                    'joined_at' => now(),
                ]);
            }

            return $conversation->fresh();
        });
    }

    /**
     * Add new participants. Returns the freshly-attached user IDs (skipped
     * duplicates / re-invites are reflected in the count).
     *
     * @param  list<int>  $userIds
     * @return list<int>
     */
    public function addParticipants(Conversation $conversation, User $actor, array $userIds): array
    {
        $added = [];

        DB::transaction(function () use ($conversation, $actor, $userIds, &$added) {
            $existingActive = $conversation->participants()
                ->wherePivotNull('left_at')
                ->pluck('users.id')
                ->all();
            $existingActive = array_map('intval', $existingActive);

            foreach ($userIds as $uid) {
                $uid = (int) $uid;
                if (in_array($uid, $existingActive, true)) {
                    continue;
                }

                // Re-invite path: previously-left participant rejoins.
                $hasLeftRow = ConversationParticipant::query()
                    ->where('conversation_id', $conversation->id)
                    ->where('user_id', $uid)
                    ->exists();

                if ($hasLeftRow) {
                    ConversationParticipant::query()
                        ->where('conversation_id', $conversation->id)
                        ->where('user_id', $uid)
                        ->update([
                            'role' => ParticipantRole::Member->value,
                            'joined_at' => now(),
                            'left_at' => null,
                            'archived_at' => null,
                        ]);
                } else {
                    $conversation->participants()->attach($uid, [
                        'role' => ParticipantRole::Member->value,
                        'joined_at' => now(),
                    ]);
                }

                $target = User::find($uid);
                if ($target) {
                    $message = $this->systemMessages->participantAdded($conversation, $actor, $target);
                    $this->refreshLastMessage($conversation, $message);
                    $added[] = $uid;
                }
            }
        });

        // Out-of-tx so pre-commit failures don't stop the participant write.
        foreach ($added as $uid) {
            $user = User::find($uid);
            if ($user) {
                try {
                    $user->notify(new ConversationInviteNotification($conversation, $actor));
                } catch (\Throwable) {
                    // notification subsystem may be unconfigured in dev; never fail the API call.
                }
            }
        }

        return $added;
    }

    /**
     * Remove a participant. `actor` may equal `target` (self-leave).
     * The "last admin" guard kicks in when an admin tries to leave and is
     * the sole admin remaining — caller must promote someone first.
     */
    public function removeParticipant(Conversation $conversation, User $actor, User $target): void
    {
        $pivot = $conversation->participants()
            ->where('users.id', $target->id)
            ->wherePivotNull('left_at')
            ->first();

        abort_if(! $pivot, 404, 'Participant not in conversation.');

        $isSelf = $actor->id === $target->id;

        // Last-admin guard — prevent the group from going adminless.
        if ($pivot->pivot->role === ParticipantRole::Admin->value || $pivot->pivot->role === ParticipantRole::Admin) {
            $remainingAdmins = $conversation->participants()
                ->wherePivot('role', ParticipantRole::Admin->value)
                ->wherePivotNull('left_at')
                ->where('users.id', '!=', $target->id)
                ->count();

            if ($remainingAdmins === 0) {
                throw ValidationException::withMessages([
                    'role' => [__('messaging.errors.promote_admin_before_leaving')],
                ]);
            }
        }

        DB::transaction(function () use ($conversation, $target, $actor) {
            $conversation->participants()->updateExistingPivot($target->id, [
                'left_at' => now(),
            ]);

            $message = $this->systemMessages->participantRemoved($conversation, $actor, $target);
            $this->refreshLastMessage($conversation, $message);
        });
    }

    /**
     * Promote / demote between admin and member. Idempotent — re-applying
     * the same role is a no-op (no system message emitted).
     */
    public function setRole(Conversation $conversation, User $actor, User $target, ParticipantRole $role): void
    {
        $pivot = $conversation->participants()
            ->where('users.id', $target->id)
            ->wherePivotNull('left_at')
            ->first();

        abort_if(! $pivot, 404, 'Participant not in conversation.');

        $current = $pivot->pivot->role instanceof ParticipantRole
            ? $pivot->pivot->role->value
            : (string) $pivot->pivot->role;

        if ($current === $role->value) {
            return; // no-op
        }

        // Demoting the last admin would orphan the group.
        if ($current === ParticipantRole::Admin->value && $role === ParticipantRole::Member) {
            $remainingAdmins = $conversation->participants()
                ->wherePivot('role', ParticipantRole::Admin->value)
                ->wherePivotNull('left_at')
                ->where('users.id', '!=', $target->id)
                ->count();

            if ($remainingAdmins === 0) {
                throw ValidationException::withMessages([
                    'role' => [__('messaging.errors.cannot_demote_last_admin')],
                ]);
            }
        }

        DB::transaction(function () use ($conversation, $actor, $target, $role) {
            $conversation->participants()->updateExistingPivot($target->id, [
                'role' => $role->value,
            ]);

            $message = $this->systemMessages->roleChanged($conversation, $actor, $target, $role->value);
            $this->refreshLastMessage($conversation, $message);
        });
    }

    /**
     * Self-leave. Convenience wrapper around removeParticipant with
     * actor == target.
     */
    public function leave(Conversation $conversation, User $actor): void
    {
        $this->removeParticipant($conversation, $actor, $actor);
    }

    /**
     * Rename the group. Emits a `renamed` system message.
     */
    public function rename(Conversation $conversation, User $actor, string $newSubject): void
    {
        $old = $conversation->subject;
        if ($old === $newSubject) {
            return;
        }

        DB::transaction(function () use ($conversation, $actor, $old, $newSubject) {
            $conversation->update(['subject' => $newSubject]);

            $message = $this->systemMessages->renamed($conversation, $actor, $old, $newSubject);
            $this->refreshLastMessage($conversation, $message);
        });
    }

    /**
     * Per-participant mute toggle. Notifications are suppressed for the
     * muted participant only — the message itself is still persisted.
     */
    public function setMute(Conversation $conversation, User $user, bool $muted): void
    {
        $conversation->participants()->updateExistingPivot($user->id, [
            'is_muted' => $muted,
        ]);
    }

    /**
     * Active participants of a group, excluding those who left. Used by
     * the notification layer to fan out new-message events.
     */
    public function activeParticipants(Conversation $conversation): Collection
    {
        return $conversation->participants()
            ->wherePivotNull('left_at')
            ->get();
    }

    protected function refreshLastMessage(Conversation $conversation, $message): void
    {
        // The MessageObserver already syncs preview + last_message_id.
        // We only need to make sure the in-memory model reflects the
        // latest values for the caller (controller will resource-ify it).
        $conversation->refresh();
    }
}
