<?php

namespace App\Services\Messaging;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Support\Logging\SafeExceptionContext;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * TCK-085 — All write paths for a `type = group` Conversation.
 *
 * Goals:
 *  - Atomically grow / shrink / re-role the participant set.
 *  - Always emit a system message describing the change.
 *  - Refuse to leave the group adminless ("last admin" guard).
 *  - Send the `message.group_invite` notification to fresh participants (TCK-861).
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
     * @param  bool  $sendInvites  TCK-804 — false for a thread opened by the platform itself, whose members are
     *                             already told by their own notification (see SyncMaintenanceConversation).
     * @param  (Closure(Conversation): void)|null  $avantLesInvitations  TCK-2782 — ce qui s'écrit dans le groupe
     *                                                                   À SA CRÉATION (le message initial,
     *                                                                   {@see ConversationWriter::post()}), dans la même
     *                                                                   transaction : un refus (403) annule le groupe, et
     *                                                                   aucune invitation n'est partie.
     * @param  Model|null  $sujet  TCK-2957 (ADR-0128 § 1) — l'objet auquel le fil appartient, écrit par le registre
     *                             `SujetsDuFil` (sa clé, jamais sa classe) ; un objet hors des types sujets lève.
     */
    public function create(
        User $creator,
        string $subject,
        array $participantIds,
        ?int $propertyId = null,
        ?int $leaseId = null,
        ?int $maintenanceRequestId = null,
        bool $sendInvites = true,
        ?Closure $avantLesInvitations = null,
        ?Model $sujet = null,
    ): Conversation {
        $invited = [];
        // TCK-2957 — résolu AVANT la transaction : un objet hors registre n'ouvre rien.
        $subjectType = $sujet === null ? null : SujetsDuFil::typeDuSujet($sujet);

        $conversation = DB::transaction(function () use (
            &$invited,
            $creator,
            $subject,
            $participantIds,
            $propertyId,
            $leaseId,
            $maintenanceRequestId,
            $avantLesInvitations,
            $subjectType,
            $sujet,
        ) {
            $conversation = Conversation::create([
                'subject' => $subject,
                'type' => ConversationType::Group->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $creator->id,
                'property_id' => $propertyId,
                'lease_id' => $leaseId,
                'maintenance_request_id' => $maintenanceRequestId,
                // TCK-2957 — le sujet du fil (ADR-0128 § 1).
                'subject_type' => $subjectType,
                'subject_id' => $sujet?->getKey(),
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
            $invited = array_map('intval', $unique);

            // TCK-2782 — le message initial, jugé comme un envoi, avant le COMMIT et avant les invitations.
            if ($avantLesInvitations !== null) {
                $avantLesInvitations($conversation);
            }

            return $conversation->fresh();
        });

        // TCK-804 (P38.01) — the members of a brand-new group are "fresh participants" too:
        // until then only addParticipants() sent the invite, and nobody heard of a new group.
        if ($sendInvites) {
            $this->sendInvites($conversation, $creator, $invited);
        }

        return $conversation;
    }

    /**
     * TCK-2859 (ADR-0114 § 3) — « ajouter quelqu'un » à un fil DIRECT : un groupe neuf, administré par
     * l'acteur, dont les membres sont l'autre partie de la directe et les personnes ajoutées. Il
     * reprend le bien et le bail de la directe ; AUCUN message n'y est copié (l'échange à deux reste
     * à ces deux-là). La directe n'est pas touchée. Le sujet : celui envoyé, sinon celui de la
     * directe, sinon les noms des membres.
     *
     * La joignabilité, la borne du bail et le plafond de 20 sont jugés avant, par
     * `AddParticipantsRequest` ; l'autorisation par `ConversationPolicy::addToDirect`.
     *
     * @param  list<int>  $userIds
     */
    public function createFromDirect(Conversation $direct, User $actor, array $userIds, ?string $subject = null): Conversation
    {
        $autres = $direct->participants()
            ->wherePivotNull('left_at')
            ->where('users.id', '!=', $actor->id)
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $membres = array_values(array_unique(array_filter(
            array_merge($autres, array_map('intval', $userIds)),
            fn (int $id) => $id !== (int) $actor->id,
        )));

        $sujet = trim((string) $subject) !== '' ? trim((string) $subject)
            : (trim((string) $direct->subject) !== '' ? (string) $direct->subject
                : User::query()->whereIn('id', [$actor->id, ...$membres])->orderBy('id')->get()
                    ->map(fn (User $u) => $u->nameWithoutContact())->implode(', '));

        return $this->create(
            $actor,
            mb_substr($sujet, 0, 255),
            $membres,
            $direct->property_id !== null ? (int) $direct->property_id : null,
            $direct->lease_id !== null ? (int) $direct->lease_id : null,
        );
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
            // TCK-1492 (P92.07) — la conversation verrouillée d'abord : deux ajouts simultanés du
            // même membre lisaient tous deux « absent », et le second heurtait l'index
            // `(conversation_id, user_id)` en 500. Sérialisés, le second le voit présent et le saute.
            Conversation::query()->whereKey($conversation->getKey())->lockForUpdate()->firstOrFail();

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
                // TCK-2955 (ADR-0129 § 2) — par le MODÈLE, plus par une écriture de masse : le retour
                // change la composition du fil, et `ConversationParticipant` (`EmetDesSignaux`) le signale.
                $leftRow = ConversationParticipant::query()
                    ->where('conversation_id', $conversation->id)
                    ->where('user_id', $uid)
                    ->first();

                if ($leftRow !== null) {
                    $leftRow->forceFill([
                        'role' => ParticipantRole::Member->value,
                        'joined_at' => now(),
                        'left_at' => null,
                        'archived_at' => null,
                        // TCK-861 (P38.07) — ce qui s'est écrit pendant l'absence n'est pas
                        // « non lu » : le ré-invité n'était pas là pour le lire.
                        'last_read_at' => now(),
                    ])->save();
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

        $this->sendInvites($conversation, $actor, $added);

        return $added;
    }

    /**
     * Send the `message.group_invite` notification to each freshly-attached user.
     * Called out of the transaction, so a pre-commit failure doesn't stop the participant write.
     *
     * TCK-861 (P38.07) — par code et cible (ADR-0032) : la cloche ouvre le groupe, et le titre se
     * rend dans la langue du destinataire. L'ancienne classe n'écrivait ni l'un ni l'autre.
     *
     * @param  list<int>  $userIds
     */
    private function sendInvites(Conversation $conversation, User $actor, array $userIds): void
    {
        $notifications = app(NotificationService::class);
        $params = [
            // TCK-815 — prénom et nom, puis `username`, puis « — » ; jamais l'e-mail.
            'inviter' => $actor->nameWithoutContact(),
            'subject' => $conversation->subject ?? '#'.$conversation->id,
        ];

        foreach ($userIds as $uid) {
            $user = User::find($uid);
            if ($user) {
                try {
                    $notifications->send($user, NotificationCode::MessageGroupInvite, $params, NotificationTarget::of('conversation', $conversation->id));
                } catch (\Throwable $e) {
                    // notification subsystem may be unconfigured in dev; never fail the API call.
                    // TCK-771 — logged in the safe form of ADR-0044, never the message.
                    // P179.04 (TCK-1799) — before the queue only (rendering, bell row, enqueue):
                    // a transport failure is logged by the worker, {@see \App\Notifications\CodedNotification::failed()}.
                    Log::warning('[GroupConversationService] invite notification failed', [
                        'conversation_id' => $conversation->id,
                    ] + SafeExceptionContext::of($e));
                }
            }
        }
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

        abort_code_if(! $pivot, 404, 'conversation.participant_not_found');

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

        abort_code_if(! $pivot, 404, 'conversation.participant_not_found');

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
